import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadSession, saveSession } from "../lib/gameSession.js";
import { getUncachableStripeClient } from "../lib/stripeClient.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router: IRouter = Router();

const APP_BASE_URL = `https://${process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost"}`;

/**
 * POST /payment/create-checkout-session
 * Creates a Stripe one-time-payment checkout session and returns the redirect URL.
 * Requires a valid JWT (requireAuth middleware applied on the router in index.ts).
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
      success_url: `${APP_BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&uid=${userId}`,
      cancel_url: `${APP_BASE_URL}/payment-cancel`,
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
 * POST /payment/mark-paid
 * Called by the frontend after returning from a successful Stripe checkout.
 * Idempotent — safe to call more than once.
 * Validates the Stripe session before granting access.
 */
router.post("/mark-paid", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.body ?? {};

  try {
    const stripe = await getUncachableStripeClient();

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId as string);
      if (session.payment_status !== "paid" || session.metadata?.userId !== userId) {
        res.status(400).json({ error: "PAYMENT_NOT_CONFIRMED", message: "Payment could not be verified." });
        return;
      }
    }

    await db
      .update(usersTable)
      .set({ hasPaid: true })
      .where(eq(usersTable.id, userId));

    const session = await loadSession(userId);
    if (session) {
      session.state.player.hasPaid = true;
      await saveSession(userId, session.state);
    }

    res.json({ success: true });
  } catch (err: any) {
    if (err.message?.includes("not yet connected")) {
      res.status(503).json({ error: "STRIPE_NOT_CONFIGURED", message: "Payment system is not yet configured." });
      return;
    }
    res.status(500).json({ error: "MARK_PAID_FAILED", message: err.message });
  }
});

export default router;
