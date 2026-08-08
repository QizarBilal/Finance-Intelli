import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

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
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",").map(value => value.trim()).filter(Boolean);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", ...allowedOrigins],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") callback(null, true);
    else callback(new Error("Origin is not allowed"));
  },
  credentials: true,
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/api", rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait and retry." },
}));

app.use("/api", router);

app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: error }, "Unhandled request error");
  if (res.headersSent) return;
  res.status(500).json({ error: "The request could not be completed." });
});

export default app;
