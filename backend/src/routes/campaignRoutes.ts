import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import {
  createCampaignController,
  duplicateCampaignController,
  getCampaignController,
  listCampaignsController,
  listCreativesController,
  saveCampaignLearningController,
  updateCampaignStatusController
} from "../controllers/campaignController.js";
import {
  addClientAssetController,
  analyzeClientBrandController,
  applyBrandAnalysisController,
  createClientController,
  getClientController,
  listClientBrandAnalysesController,
  listClientsController,
  reanalyzeClientMaterialsController,
  updateClientController
} from "../controllers/clientController.js";
import {
  compareAgentVersionController,
  createAgentController,
  duplicateAgentController,
  getAgentController,
  getAgentLogsController,
  listAgentsController,
  restoreAgentVersionController,
  testAgentController,
  updateAgentController
} from "../controllers/agentController.js";
import {
  createPlanController,
  getPlanController,
  listPlannerLogsController,
  listPlansController,
  listQueueController,
  planActionController,
  reprocessQueueItemController,
  updatePlanController
} from "../controllers/campaignPlannerController.js";
import {
  aiCostDashboardController,
  aiCostSettingsController,
  aiModelPricesController,
  aiUsageDetailController,
  exportAiUsageController,
  saveAiCostSettingsController,
  saveAiModelPriceController
} from "../controllers/aiCostController.js";
import {
  getClientWhatsappSettingsController,
  getWhatsappSettingsController,
  notifyQueueErrorController,
  sendCampaignWhatsappController,
  sendWhatsappTestController,
  testWhatsappConnectionController,
  updateClientWhatsappSettingsController,
  updateWhatsappSettingsController
} from "../controllers/whatsappController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const uploadDir = path.resolve("uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 12 * 1024 * 1024 }
});

export const campaignRoutes = Router();

campaignRoutes.get("/campaigns", listCampaignsController);
campaignRoutes.post("/campaigns", upload.single("referencia_arquivo"), asyncHandler(createCampaignController));
campaignRoutes.get("/campaigns/:id", getCampaignController);
campaignRoutes.get("/campaigns/:id/duplicate", duplicateCampaignController);
campaignRoutes.post("/campaigns/:id/learning", saveCampaignLearningController);
campaignRoutes.patch("/campaigns/:id/status", updateCampaignStatusController);
campaignRoutes.post("/campaigns/:id/send-whatsapp", asyncHandler(sendCampaignWhatsappController));
campaignRoutes.get("/creatives", listCreativesController);

campaignRoutes.get("/clients", listClientsController);
campaignRoutes.post("/clients", createClientController);
campaignRoutes.get("/clients/:id", getClientController);
campaignRoutes.put("/clients/:id", updateClientController);
campaignRoutes.get("/clients/:id/whatsapp-settings", getClientWhatsappSettingsController);
campaignRoutes.put("/clients/:id/whatsapp-settings", updateClientWhatsappSettingsController);
campaignRoutes.post("/clients/:id/assets", upload.single("file"), addClientAssetController);
campaignRoutes.get("/clients/:id/brand-analyses", listClientBrandAnalysesController);
campaignRoutes.post("/clients/:id/brand-analysis", asyncHandler(analyzeClientBrandController));
campaignRoutes.post("/clients/:id/brand-analysis/reanalyze-materials", asyncHandler(reanalyzeClientMaterialsController));
campaignRoutes.post("/clients/:id/brand-analysis/:analysisId/apply", applyBrandAnalysisController);

campaignRoutes.get("/agents", listAgentsController);
campaignRoutes.post("/agents", createAgentController);
campaignRoutes.get("/agents/:id", getAgentController);
campaignRoutes.put("/agents/:id", updateAgentController);
campaignRoutes.post("/agents/:id/duplicate", duplicateAgentController);
campaignRoutes.post("/agents/:id/test", asyncHandler(testAgentController));
campaignRoutes.get("/agents/:id/logs", getAgentLogsController);
campaignRoutes.post("/agents/:id/versions/:versionId/restore", restoreAgentVersionController);
campaignRoutes.get("/agents/:id/versions/:versionId/compare", compareAgentVersionController);

campaignRoutes.get("/campaign-plans", listPlansController);
campaignRoutes.post("/campaign-plans", createPlanController);
campaignRoutes.get("/campaign-plans/:id", getPlanController);
campaignRoutes.put("/campaign-plans/:id", updatePlanController);
campaignRoutes.post("/campaign-plans/:id/:action", planActionController);
campaignRoutes.get("/campaign-generation-queue", listQueueController);
campaignRoutes.post("/campaign-generation-queue/:id/reprocess", reprocessQueueItemController);
campaignRoutes.get("/campaign-generation-logs", listPlannerLogsController);
campaignRoutes.post("/queue/:id/notify-error", asyncHandler(notifyQueueErrorController));

campaignRoutes.get("/whatsapp/settings", getWhatsappSettingsController);
campaignRoutes.put("/whatsapp/settings", updateWhatsappSettingsController);
campaignRoutes.post("/whatsapp/test-connection", asyncHandler(testWhatsappConnectionController));
campaignRoutes.post("/whatsapp/send-test", asyncHandler(sendWhatsappTestController));

campaignRoutes.get("/ai-costs", aiCostDashboardController);
campaignRoutes.get("/ai-costs/export/:format", exportAiUsageController);
campaignRoutes.get("/ai-costs/usage/:id", aiUsageDetailController);
campaignRoutes.get("/ai-costs/model-prices", aiModelPricesController);
campaignRoutes.post("/ai-costs/model-prices", saveAiModelPriceController);
campaignRoutes.get("/ai-costs/settings", aiCostSettingsController);
campaignRoutes.put("/ai-costs/settings", saveAiCostSettingsController);
