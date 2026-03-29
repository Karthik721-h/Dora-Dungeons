import type { Request, Response } from "express";
import { z } from "zod";
import * as authService from "./auth.service.js";

// ── Validation schemas ────────────────────────────────────────────────────────

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function signup(req: Request, res: Response): Promise<void> {
  const result = signupSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: result.error.errors.map((e: { message: string }) => e.message).join("; "),
    });
    return;
  }

  try {
    const { user, token } = await authService.signup(
      result.data.email,
      result.data.password
    );
    res.status(201).json({ user, token });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    const status = e.status ?? 500;
    if (status === 409) {
      res.status(409).json({ error: "CONFLICT", message: e.message });
    } else {
      res.status(status).json({ error: "INTERNAL_ERROR", message: e.message });
    }
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: result.error.errors.map((e: { message: string }) => e.message).join("; "),
    });
    return;
  }

  try {
    const { user, token } = await authService.login(
      result.data.email,
      result.data.password
    );
    res.status(200).json({ user, token });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    const status = e.status ?? 500;
    if (status === 401) {
      res.status(401).json({ error: "UNAUTHORIZED", message: e.message });
    } else {
      res.status(status).json({ error: "INTERNAL_ERROR", message: e.message });
    }
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
    return;
  }

  try {
    const user = await authService.getMe(userId);
    res.status(200).json({ user });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
}
