import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import gameRouter from "./game.js";
import shopRouter from "./shop.js";
import authRouter from "./auth.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/game", requireAuth, gameRouter);
router.use("/shop", requireAuth, shopRouter);
router.use(authRouter);

export default router;
