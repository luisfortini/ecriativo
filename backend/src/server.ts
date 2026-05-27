import cors from "cors";
import express from "express";
import path from "node:path";
import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { campaignRoutes } from "./routes/campaignRoutes.js";
import { startQueueWorker } from "./services/queueWorker.js";
import { errorHandler } from "./utils/errors.js";

migrate();

const app = express();

app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json({ limit: "2mb" }));
app.use("/generated", express.static(path.resolve("generated")));
app.use("/uploads", express.static(path.resolve("uploads")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    openaiConfigured: Boolean(config.openaiApiKey)
  });
});

app.use("/api", campaignRoutes);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`e-Criativo API em http://localhost:${config.port}`);
});

startQueueWorker();
