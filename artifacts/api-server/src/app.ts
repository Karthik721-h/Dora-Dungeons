import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: [
      "capacitor://localhost", // iOS Capacitor WebView
      "http://localhost:3000",
      "http://localhost:8080",
      "http://localhost",
    ],
    credentials: true, // allow dd_jwt cookie/token to be sent cross-origin
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

export default app;
