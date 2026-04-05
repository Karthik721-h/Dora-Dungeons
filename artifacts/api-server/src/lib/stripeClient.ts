/**
 * Stripe client factory — fetches fresh credentials from the Replit
 * Connectors API on every call so tokens never go stale.
 *
 * This file is populated after the Stripe integration is connected.
 * It is intentionally left as a placeholder until proposeIntegration
 * completes and addIntegration returns the rendered code snippet.
 */
export async function getUncachableStripeClient(): Promise<import("stripe").default> {
  throw new Error(
    "Stripe integration is not yet connected. " +
    "Complete the Stripe OAuth flow in the Replit integrations panel first."
  );
}

export async function getStripeSync(): Promise<import("stripe-replit-sync").StripeSync> {
  throw new Error(
    "Stripe integration is not yet connected. " +
    "Complete the Stripe OAuth flow in the Replit integrations panel first."
  );
}
