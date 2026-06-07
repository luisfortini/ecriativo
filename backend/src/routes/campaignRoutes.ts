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

campaignRoutes.get("/campaigns", asyncHandler(listCampaignsController));
campaignRoutes.post("/campaigns", upload.single("referencia_arquivo"), asyncHandler(createCampaignController));
campaignRoutes.get("/campaigns/:id", asyncHandler(getCampaignController));
campaignRoutes.get("/campaigns/:id/duplicate", asyncHandler(duplicateCampaignController));
campaignRoutes.post("/campaigns/:id/learning", asyncHandler(saveCampaignLearningController));
campaignRoutes.patch("/campaigns/:id/status", asyncHandler(updateCampaignStatusController));
campaignRoutes.post("/campaigns/:id/send-whatsapp", asyncHandler(sendCampaignWhatsappController));
campaignRoutes.get("/creatives", asyncHandler(listCreativesController));

campaignRoutes.get("/clients", asyncHandler(listClientsController));
campaignRoutes.post("/clients", asyncHandler(createClientController));
campaignRoutes.get("/clients/:id", asyncHandler(getClientController));
campaignRoutes.put("/clients/:id", asyncHandler(updateClientController));
campaignRoutes.get("/clients/:id/whatsapp-settings", asyncHandler(getClientWhatsappSettingsController));
campaignRoutes.put("/clients/:id/whatsapp-settings", asyncHandler(updateClientWhatsappSettingsController));
campaignRoutes.post("/clients/:id/assets", upload.single("file"), asyncHandler(addClientAssetController));
campaignRoutes.get("/clients/:id/brand-analyses", asyncHandler(listClientBrandAnalysesController));
campaignRoutes.post("/clients/:id/brand-analysis", asyncHandler(analyzeClientBrandController));
campaignRoutes.post("/clients/:id/brand-analysis/reanalyze-materials", asyncHandler(reanalyzeClientMaterialsController));
campaignRoutes.post("/clients/:id/brand-analysis/:analysisId/apply", asyncHandler(applyBrandAnalysisController));

campaignRoutes.get("/agents", asyncHandler(listAgentsController));
campaignRoutes.post("/agents", asyncHandler(createAgentController));
campaignRoutes.get("/agents/:id", asyncHandler(getAgentController));
campaignRoutes.put("/agents/:id", asyncHandler(updateAgentController));
campaignRoutes.post("/agents/:id/duplicate", asyncHandler(duplicateAgentController));
campaignRoutes.post("/agents/:id/test", asyncHandler(testAgentController));
campaignRoutes.get("/agents/:id/logs", asyncHandler(getAgentLogsController));
campaignRoutes.post("/agents/:id/versions/:versionId/restore", asyncHandler(restoreAgentVersionController));
campaignRoutes.get("/agents/:id/versions/:versionId/compare", asyncHandler(compareAgentVersionController));

campaignRoutes.get("/campaign-plans", asyncHandler(listPlansController));
campaignRoutes.post("/campaign-plans", asyncHandler(createPlanController));
campaignRoutes.get("/campaign-plans/:id", asyncHandler(getPlanController));
campaignRoutes.put("/campaign-plans/:id", asyncHandler(updatePlanController));
campaignRoutes.post("/campaign-plans/:id/:action", asyncHandler(planActionController));
campaignRoutes.get("/campaign-generation-queue", asyncHandler(listQueueController));
campaignRoutes.post("/campaign-generation-queue/:id/reprocess", asyncHandler(reprocessQueueItemController));
campaignRoutes.get("/campaign-generation-logs", asyncHandler(listPlannerLogsController));
campaignRoutes.post("/queue/:id/notify-error", asyncHandler(notifyQueueErrorController));

campaignRoutes.get("/whatsapp/settings", asyncHandler(getWhatsappSettingsController));
campaignRoutes.put("/whatsapp/settings", asyncHandler(updateWhatsappSettingsController));
campaignRoutes.post("/whatsapp/test-connection", asyncHandler(testWhatsappConnectionController));
campaignRoutes.post("/whatsapp/send-test", asyncHandler(sendWhatsappTestController));

campaignRoutes.get("/ai-costs", asyncHandler(aiCostDashboardController));
campaignRoutes.get("/ai-costs/export/:format", asyncHandler(exportAiUsageController));
campaignRoutes.get("/ai-costs/usage/:id", asyncHandler(aiUsageDetailController));
campaignRoutes.get("/ai-costs/model-prices", asyncHandler(aiModelPricesController));
campaignRoutes.post("/ai-costs/model-prices", asyncHandler(saveAiModelPriceController));
campaignRoutes.get("/ai-costs/settings", asyncHandler(aiCostSettingsController));
campaignRoutes.put("/ai-costs/settings", asyncHandler(saveAiCostSettingsController));
