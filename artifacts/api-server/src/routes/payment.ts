import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router: IRouter = Router();

const APP_BASE_URL = `https://${process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost"}`;

/**
 * POST /payment/create-checkout-session
 * Creates a Stripe one-time-payment checkout session and returns the redirect URL.
 * Attaches userId to session metadata so the webhook can identify the payer.
 */
router.post("/create-checkout-session", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    if (user.hasPaid) {
      res.status(400).json({ error: "ALREADY_PAID", message: "This account has already unlocked Level 2+." });
      return;
    }

    const stripe = await getUncachableStripeClient();

    let customerId = user.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      customerId = customer.id;
      await db
        .update(usersTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(usersTable.id, userId));
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 3000,
            product_data: {
              name: "Dora Dungeons — Full Unlock",
              description: "One-time payment to unlock all dungeon levels beyond Level 1.",
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      // NOTE: success_url does NOT contain userId — payment confirmation is handled
      // exclusively by the Stripe webhook (checkout.session.completed), not by
      // anything the frontend sends after redirect. The frontend only polls /status.
      success_url: `${APP_BASE_URL}/payment-success`,
      cancel_url: `${APP_BASE_URL}/payment-cancel`,
      // userId in metadata is the authoritative source for the webhook handler
      metadata: { userId },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    if (err.message?.includes("not yet connected")) {
      res.status(503).json({ error: "STRIPE_NOT_CONFIGURED", message: "Payment system is not yet configured." });
      return;
    }
    res.status(500).json({ error: "CHECKOUT_FAILED", message: err.message });
  }
});

/**
 * GET /payment/status
 * Returns the current hasPaid status for the authenticated user.
 * Used by the payment-success page to poll until the webhook has fired.
 * Safe to call repeatedly — read-only, no side effects.
 */
router.get("/status", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  try {
    const [user] = await db
      .select({ hasPaid: usersTable.hasPaid })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    res.json({ hasPaid: user.hasPaid });
  } catch (err: any) {
    res.status(500).json({ error: "STATUS_CHECK_FAILED", message: err.message });
  }
});

export default router;
