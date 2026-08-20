import { getUncachableStripeClient } from "./stripeClient";

const products = [
  {
    id: "basic",
    name: "Frenchami Basic",
    description: "The focused French practice habit.",
    amount: 1499,
    interval: "month" as const,
  },
  {
    id: "platinum",
    name: "Frenchami Platinum",
    description: "The full Frenchami learning experience.",
    amount: 13999,
    interval: "year" as const,
  },
];

const run = async () => {
  const stripe = await getUncachableStripeClient();
  for (const definition of products) {
    const existingProducts = await stripe.products.search({
      query: `metadata['frenchami_plan_id']:'${definition.id}' AND active:'true'`,
    });
    const product = existingProducts.data[0] ?? await stripe.products.create({
      name: definition.name,
      description: definition.description,
      metadata: { frenchami_plan_id: definition.id },
    });
    const prices = await stripe.prices.list({ product: product.id, active: true, type: "recurring", limit: 100 });
    const matchingPrice = prices.data.find((price) =>
      price.unit_amount === definition.amount
      && price.currency === "usd"
      && price.recurring?.interval === definition.interval
      && price.metadata?.frenchami_plan_id === definition.id);
    if (matchingPrice) {
      console.log(`${definition.name} already has ${matchingPrice.id}`);
      continue;
    }
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: definition.amount,
      currency: "usd",
      recurring: { interval: definition.interval },
      metadata: { frenchami_plan_id: definition.id },
    });
    console.log(`Created ${definition.name}: ${price.id}`);
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});