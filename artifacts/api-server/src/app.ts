import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import { MAX_LIBRARY_IMPORT_BYTES } from "./lib/library-import";
import { requireAuth } from "./middleware/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));

// Session
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      pool,
    }),
    name: "lh_sid",
    secret: process.env["SESSION_SECRET"] ?? "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  }),
);

app.use(
  "/api/library/import",
  requireAuth,
  express.json({ limit: MAX_LIBRARY_IMPORT_BYTES }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use(
  (error: unknown, req: Request, res: Response, next: NextFunction): void => {
    const bodyError = error as { type?: string };
    if (
      req.originalUrl.startsWith("/api/library/import") &&
      bodyError.type === "entity.too.large"
    ) {
      res
        .status(413)
        .json({ error: "Import document exceeds the 32 KiB limit." });
      return;
    }
    if (
      req.originalUrl.startsWith("/api/library/import") &&
      bodyError.type === "entity.parse.failed"
    ) {
      res
        .status(400)
        .json({ error: "The selected file does not contain valid JSON." });
      return;
    }
    next(error);
  },
);

export default app;
