import cron from "node-cron";
import { all, runWithOrganizationContext } from "../db/connection.js";
import { processDueQueue } from "./campaignPlannerService.js";
import { sendDailySummary } from "./whatsappNotificationService.js";

export function startQueueWorker() {
  const queueTask = cron.schedule("* * * * *", () => {
    processDueQueue().catch((error) => {
      console.error("Erro no worker da fila de campanhas", error);
    });
  });
  const dailySummaryTask = cron.schedule("0 18 * * *", () => {
    sendDailySummaries().catch((error) => {
      console.error("Erro ao enviar resumo diario por WhatsApp", error);
    });
  });

  return [queueTask, dailySummaryTask];
}

export async function sendDailySummaries() {
  const organizations = await all<{ id: number }>("SELECT id FROM organizations WHERE status = 'active' ORDER BY id");
  for (const organization of organizations) {
    try {
      await runWithOrganizationContext(Number(organization.id), sendDailySummary);
    } catch (error) {
      console.error(`Erro no resumo diario da organizacao ${organization.id}`, error);
    }
  }
}
