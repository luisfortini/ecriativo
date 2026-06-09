import cors from "cors";
import express from "express";
import path from "node:path";
import { config } from "./config.js";
import { databaseHealth, pool } from "./db/connection.js";
import { migrate } from "./db/migrate.js";
import { campaignRoutes } from "./routes/campaignRoutes.js";
import { startQueueWorker } from "./services/queueWorker.js";
import { errorHandler } from "./utils/errors.js";

const app = express();

const allowedOrigins = new Set(config.frontendOrigins);

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = origin.replace(/\/$/, "");
    callback(null, allowedOrigins.has(normalizedOrigin));
  }
}));
app.use(express.json({ limit: "2mb" }));
app.use("/generated", express.static(path.resolve("generated")));
app.use("/uploads", express.static(path.resolve("uploads")));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "e-Criativo API"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "e-Criativo API"
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    openaiConfigured: Boolean(config.openaiApiKey)
  });
});

app.get("/health/database", async (_req, res, next) => {
  try {
    res.json(await databaseHealth());
  } catch (error) {
    next(error);
  }
});

app.use("/api", campaignRoutes);
app.use(errorHandler);

async function bootstrap() {
  await migrate();
  const tasks = startQueueWorker();
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`e-Criativo API em http://0.0.0.0:${config.port}`);
    console.log(`CORS origins: ${config.frontendOrigins.join(", ")}`);
  });

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`Recebido ${signal}; encerrando API.`);
    tasks.forEach((task) => task.stop());
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

void bootstrap().catch((error) => {
  console.error("Falha ao iniciar API", error);
  process.exit(1);
});
