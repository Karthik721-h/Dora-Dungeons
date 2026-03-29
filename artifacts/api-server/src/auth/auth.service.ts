import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable, type PublicUser } from "@workspace/db";
import { eq } from "drizzle-orm";

const BCRYPT_ROUNDS = 12;

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

function toPublicUser(user: {
  id: string;
  email: string;
  subscriptionStatus: "FREE" | "PRO";
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    subscriptionStatus: user.subscriptionStatus,
    createdAt: user.createdAt,
  };
}

// ── Signup ────────────────────────────────────────────────────────────────────

export async function signup(
  email: string,
  password: string
): Promise<{ user: PublicUser; token: string }> {
  // Check for existing user
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    const err = new Error("User already exists") as Error & { status: number };
    err.status = 409;
    throw err;
  }

  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const [created] = await db
    .insert(usersTable)
    .values({ email: email.toLowerCase(), password: hashed })
    .returning();

  if (!created) throw new Error("Failed to create user");

  const token = jwt.sign({ sub: created.id, email: created.email }, getJwtSecret(), {
    expiresIn: "7d",
  });

  return { user: toPublicUser(created), token };
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string
): Promise<{ user: PublicUser; token: string }> {
  const [found] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (!found) {
    const err = new Error("Invalid credentials") as Error & { status: number };
    err.status = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, found.password);
  if (!valid) {
    const err = new Error("Invalid credentials") as Error & { status: number };
    err.status = 401;
    throw err;
  }

  const token = jwt.sign({ sub: found.id, email: found.email }, getJwtSecret(), {
    expiresIn: "7d",
  });

  return { user: toPublicUser(found), token };
}

// ── Me ────────────────────────────────────────────────────────────────────────

export async function getMe(userId: string): Promise<PublicUser> {
  const [found] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!found) {
    const err = new Error("User not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }

  return toPublicUser(found);
}
