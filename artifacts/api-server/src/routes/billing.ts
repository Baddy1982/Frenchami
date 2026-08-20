import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import {
  CreateBillingCheckoutBody,
  CreateBillingCheckoutResponse,
  GetBillingAccessResponse,
  GetBillingPlansResponse,
} from "@workspace/api-zod";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();
const premiumAccessUrl = "https://app.frenchami.com/authentication/access-request?organization=49";
const appOrigin = () => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domain ? `https://${domain}` : "http://localhost";
};

const planDefinitions = [
  { id: "basic", name: "Basic", description: "The focused French practice habit.", interval: "month" as const, amount: 1499, currency: "usd" as const, productName: "Frenchami Basic" },
  { id: "platinum", name: "Platinum", description: "The full Frenchami learning experience.", interval: "year" as const, amount: 13999, currency: "usd" as const, productName: "Frenchami Platinum" },
];

type AuthenticatedRequest = Request & { userId?: string };
const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = getAuth(req).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
  return undefined;
};

async function getStripePriceIds(stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const prices = await Promise.all(planDefinitions.map(async (definition) => {
    const product = products.data.find((candidate) =>
      candidate.name === definition.productName && candidate.metadata?.frenchami_plan_id === definition.id);
    if (!product) throw new Error(`Stripe product ${definition.productName} is missing.`);

    const productPrices = await stripe.prices.list({ product: product.id, active: true, type: "recurring", limit: 100 });
    const price = productPrices.data.find((candidate) =>
      candidate.unit_amount === definition.amount
      && candidate.currency === definition.currency
      && candidate.recurring?.interval === definition.interval
      && candidate.metadata?.frenchami_plan_id === definition.id);
    if (!price) throw new Error(`Stripe price for ${definition.name} is missing.`);
    return { definition, product, price };
  }));
  return prices;
}

router.get("/billing/plans", async (_req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const plans = await getStripePriceIds(stripe);
    return res.json(GetBillingPlansResponse.parse(plans.map(({ definition, price }) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      amount: definition.amount,
      currency: definition.currency,
      interval: definition.interval,
      priceId: price.id,
    }))));
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Billing plans are temporarily unavailable." });
  }
});

router.post("/billing/checkout", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { planId } = CreateBillingCheckoutBody.parse(req.body);
    const definition = planDefinitions.find((plan) => plan.id === planId);
    if (!definition) return res.status(400).json({ error: "Unknown billing plan." });

    const stripe = await getUncachableStripeClient();
    const plans = await getStripePriceIds(stripe);
    const selected = plans.find(({ definition: candidate }) => candidate.id === definition.id);
    if (!selected) return res.status(404).json({ error: "Billing plan not found." });

    const origin = appOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: selected.price.id, quantity: 1 }],
      client_reference_id: req.userId,
      allow_promotion_codes: true,
      success_url: `${origin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      metadata: { frenchamiUserId: req.userId!, frenchamiPlanId: definition.id },
      subscription_data: {
        metadata: { frenchamiUserId: req.userId!, frenchamiPlanId: definition.id },
      },
    });
    return res.json(CreateBillingCheckoutResponse.parse({ url: session.url }));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to start checkout." });
  }
});

router.get("/billing/access", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : undefined;
    let active = false;
    let planId: string | null = null;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
      const sessionUserId = session.client_reference_id ?? session.metadata?.frenchamiUserId;
      const subscription = typeof session.subscription === "object" ? session.subscription : null;
      active = sessionUserId === req.userId
        && session.payment_status === "paid"
        && Boolean(subscription && subscription.status === "active");
      planId = active ? session.metadata?.frenchamiPlanId ?? null : null;
    } else {
      const subscriptions = await stripe.subscriptions.search({
        query: `metadata['frenchamiUserId']:'${req.userId}'`,
        limit: 20,
      });
      const subscription = subscriptions.data.find((candidate) => candidate.status === "active");
      active = Boolean(subscription);
      planId = subscription?.metadata?.frenchamiPlanId ?? null;
    }

    return res.json(GetBillingAccessResponse.parse({ active, planId, premiumUrl: active ? premiumAccessUrl : null }));
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Unable to verify premium access." });
  }
});

export default router;