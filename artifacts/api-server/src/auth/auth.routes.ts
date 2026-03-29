import { Router, type IRouter } from "express";
import { signup, login, me } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

const router: IRouter = Router();

// POST /api/auth/signup
router.post("/signup", signup);

// POST /api/auth/login
router.post("/login", login);

// GET /api/auth/me  (requires valid JWT)
router.get("/me", requireAuth, me);

export default router;
