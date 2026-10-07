import cron from "node-cron";
import { all, runWithOrganizationContext } from "../db/connection.js";
import { processDueQueue } from "./campaignPlannerService.js";
import { sendDailySummary } from "./whatsappNotificationService.js";
import { processEditorialQueue } from "./editorialService.js";
import { processSocialPublications } from "./socialPublishingService.js";

export function startQueueWorker() {
  const publishingTask = cron.schedule("* * * * *",()=>{void processSocialPublications().catch(()=>console.error("Falha na fila de publicação social; consulte o histórico."));});
  const editorialTask = cron.schedule("* * * * *", () => {
    void processEditorialQueue().catch(error => console.error("Erro no worker editorial",error));
  });
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

  return [queueTask, dailySummaryTask, editorialTask,publishingTask];
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
