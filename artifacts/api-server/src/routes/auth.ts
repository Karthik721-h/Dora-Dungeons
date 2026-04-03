import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signJwt } from "../lib/auth.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router: IRouter = Router();

router.post("/auth/signup", async (req: Request, res: Response) => {
  const { email, firstName, lastName } = req.body ?? {};

  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "INVALID_EMAIL", message: "A valid email is required." });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "EMAIL_TAKEN", message: "An account with this email already exists." });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      email: email.toLowerCase(),
      firstName: typeof firstName === "string" ? firstName : null,
      lastName: typeof lastName === "string" ? lastName : null,
    })
    .returning();

  const token = signJwt({ id: user.id, email: user.email });
  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
  });
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const { email } = req.body ?? {};

  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "INVALID_EMAIL", message: "A valid email is required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "NOT_FOUND", message: "No account found with that email address." });
    return;
  }

  const token = signJwt({ id: user.id, email: user.email });
  res.json({
    token,
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
  });
});

router.get("/auth/me", requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
