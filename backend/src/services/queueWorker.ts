import cron from "node-cron";
import { processDueQueue } from "./campaignPlannerService.js";

export function startQueueWorker() {
  cron.schedule("* * * * *", () => {
    processDueQueue().catch((error) => {
      console.error("Erro no worker da fila de campanhas", error);
    });
  });
}
