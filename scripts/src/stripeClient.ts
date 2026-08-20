import Stripe from "stripe";

async function getStripeCredentials(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;
  if (!hostname || !xReplitToken) throw new Error("Stripe integration credentials are unavailable.");

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken }, signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) throw new Error(`Failed to fetch Stripe credentials: ${response.status}`);
  const data = await response.json() as { items?: Array<{ settings?: { secret?: string; secret_key?: string } }> };
  const settings = data.items?.[0]?.settings;
  const secretKey = settings?.secret ?? settings?.secret_key;
  if (!secretKey) throw new Error("Stripe secret key is missing.");
  return secretKey;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  return new Stripe(await getStripeCredentials());
}