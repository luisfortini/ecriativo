import cron from "node-cron";
import { processDueQueue } from "./campaignPlannerService.js";
import { sendDailySummary } from "./whatsappNotificationService.js";

export function startQueueWorker() {
  cron.schedule("* * * * *", () => {
    processDueQueue().catch((error) => {
      console.error("Erro no worker da fila de campanhas", error);
    });
  });
  cron.schedule("0 18 * * *", () => {
    sendDailySummary().catch((error) => {
      console.error("Erro ao enviar resumo diario por WhatsApp", error);
    });
  });
}
