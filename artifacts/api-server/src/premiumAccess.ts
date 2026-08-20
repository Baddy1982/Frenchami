import type { getUncachableStripeClient } from "./stripeClient";

export const DEFAULT_PREMIUM_APP_URL =
  "https://app.frenchami.com/authentication/access-request?organization=49";

/**
 * The premium app is a separately deployed application. Keep its destination
 * server-controlled so a checkout/access response can never become an open
 * redirect.
 */
export function getPremiumAppUrl(): string {
  const configuredUrl = process.env.PREMIUM_APP_URL?.trim() || DEFAULT_PREMIUM_APP_URL;
  const url = new URL(configuredUrl);

  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("PREMIUM_APP_URL must use HTTPS in production.");
  }

  return url.toString();
}

type StripeClient = Awaited<ReturnType<typeof getUncachableStripeClient>>;

export async function verifyPremiumAccess({
  stripe,
  userId,
  sessionId,
}: {
  stripe: StripeClient;
  userId: string;
  sessionId?: string;
}) {
  let active = false;
  let planId: string | null = null;

  if (sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    const sessionUserId = session.client_reference_id ?? session.metadata?.frenchamiUserId;
    const subscription = typeof session.subscription === "object" ? session.subscription : null;
    active = sessionUserId === userId
      && session.payment_status === "paid"
      && Boolean(subscription && subscription.status === "active");
    planId = active ? session.metadata?.frenchamiPlanId ?? null : null;
  } else {
    const subscriptions = await stripe.subscriptions.search({
      query: `metadata['frenchamiUserId']:'${userId}'`,
      limit: 20,
    });
    const subscription = subscriptions.data.find((candidate) => candidate.status === "active");
    active = Boolean(subscription);
    planId = subscription?.metadata?.frenchamiPlanId ?? null;
  }

  return {
    active,
    planId,
    premiumUrl: active ? getPremiumAppUrl() : null,
  };
}