import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { loadSession, saveSession } from "./gameSession.js";
import { getStripeSync } from "./stripeClient.js";

/**
 * Process a Stripe webhook payload.
 *
 * Security model:
 *  1. stripe-replit-sync verifies the HMAC signature — throws if invalid.
 *  2. Only AFTER successful verification do we parse the body and mutate our DB.
 *  3. All mutations are idempotent — safe if Stripe retries the same event.
 */
export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "This usually means express.json() parsed the body before reaching this handler. " +
        "FIX: Ensure webhook route is registered BEFORE app.use(express.json())."
      );
    }

    // ── Step 1: Verify signature + sync Stripe data to stripe.* tables ─────────
    // This throws if the signature is invalid, so nothing below runs on bad payloads.
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // ── Step 2: Parse the verified payload and handle our custom business logic ─
    let event: { type: string; data: { object: any } };
    try {
      event = JSON.parse(payload.toString("utf8"));
    } catch {
      logger.warn("Stripe webhook: could not parse JSON body after verification");
      return;
    }

    if (event.type === "checkout.session.completed") {
      await WebhookHandlers.handleCheckoutCompleted(event.data.object);
    }
  }

  /**
   * Handle checkout.session.completed:
   *  - Extract userId from session metadata
   *  - Mark hasPaid = true in users table (idempotent)
   *  - Patch the JSONB game session so the in-flight state reflects the change immediately
   */
  private static async handleCheckoutCompleted(session: any): Promise<void> {
    const userId: string | undefined = session?.metadata?.userId;
    if (!userId) {
      logger.warn({ sessionId: session?.id }, "checkout.session.completed — no userId in metadata, skipping");
      return;
    }

    if (session.payment_status !== "paid") {
      logger.warn({ sessionId: session?.id, paymentStatus: session.payment_status }, "checkout.session.completed — payment_status is not 'paid', skipping");
      return;
    }

    try {
      const [user] = await db
        .select({ id: usersTable.id, hasPaid: usersTable.hasPaid })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user) {
        logger.error({ userId }, "checkout.session.completed — user not found in DB");
        return;
      }

      if (user.hasPaid) {
        logger.info({ userId }, "checkout.session.completed — user already paid, idempotent skip");
        return;
      }

      // Mark paid in users table
      await db
        .update(usersTable)
        .set({ hasPaid: true })
        .where(eq(usersTable.id, userId));

      logger.info({ userId, sessionId: session.id }, "Payment confirmed — user unlocked");

      // Patch the active JSONB game session so the next game action sees hasPaid immediately
      const gameSession = await loadSession(userId);
      if (gameSession) {
        gameSession.state.player.hasPaid = true;
        await saveSession(userId, gameSession.state);
      }
    } catch (err) {
      logger.error({ err, userId }, "checkout.session.completed — DB update failed");
      throw err;
    }
  }
}
