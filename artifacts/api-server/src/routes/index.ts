import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import gameRouter from "./game.js";
import authRouter from "../auth/auth.routes.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/game", gameRouter);
router.use("/auth", authRouter);

export default router;
