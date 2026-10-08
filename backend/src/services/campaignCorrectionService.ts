import { all, get, run, transaction, runWithOrganizationContext } from "../db/connection.js";
import type { CampaignRecord, ClientProfile } from "../types.js";
import { AppError } from "../utils/errors.js";
import { applyBrandOverlay, validateMainLogoFile } from "./brandOverlayService.js";
import { getLatestCampaignPipelineRun } from "./campaignPipelineService.js";
import { buildCampaignCorrectionPrompt, campaignCorrectionSchema } from "./campaignCorrectionContract.js";
import { mediaFilename, readMedia } from "./mediaStorageService.js";
import { generateImage } from "./openaiService.js";
import { validateVisualReferences, type VisualReference } from "./visualLibraryService.js";

interface Correction {
  id: number; campaign_id: number; client_id: number; note: string;
  status: "queued" | "processing" | "completed" | "failed";
  before_image_url: string; before_generated_image_url: string | null;
}
interface CorrectionCampaign extends CampaignRecord {
  visual_selection: { references?: VisualReference[]; mode?: "reference" | "composition"; no_people?: boolean } | null;
}
export interface CampaignCorrectionEngine { image: typeof generateImage; overlay: typeof applyBrandOverlay; }
const defaultEngine: CampaignCorrectionEngine = { image: generateImage, overlay: applyBrandOverlay };

export async function requestCampaignCorrection(campaignId: number, input: unknown, userId: number | null) {
  const parsed = campaignCorrectionSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || "Revise o pedido de correção.", 422);
  return transaction(async db => {
    const campaign = await get<CorrectionCampaign>("SELECT * FROM campaigns WHERE id=? FOR UPDATE", [campaignId], db);
    if (!campaign) throw new AppError("Anúncio não encontrado.", 404);
    const imageUrl = campaign.final_image_url || campaign.image_url;
    if (campaign.status !== "completed" || !imageUrl || !campaign.client_id) throw new AppError("Este anúncio ainda não tem uma arte pronta para corrigir.", 422);
    if (imageUrl !== parsed.data.base_image_url) throw new AppError("A arte foi atualizada por outra pessoa. Atualize a página e confira a versão atual antes de corrigir.", 409);
    if (await get("SELECT id FROM campaign_image_corrections WHERE campaign_id=? AND status IN ('queued','processing')", [campaignId], db)) throw new AppError("Já existe uma correção em andamento para este anúncio.", 409);
    await validateVisualReferences(Number(campaign.client_id), campaign.visual_selection?.references || [], "ads");
    const saved = await run(`INSERT INTO campaign_image_corrections(campaign_id,client_id,user_id,note,before_image_url,before_generated_image_url,before_image_path)
      VALUES(?,?,?,?,?,?,?)`, [campaignId, campaign.client_id, userId, parsed.data.note, imageUrl, campaign.image_url, campaign.image_path], db);
    return get<Correction>("SELECT * FROM campaign_image_corrections WHERE id=?", [saved.lastInsertRowid], db);
  });
}

let running = false;
export async function processCampaignImageCorrections(engine: CampaignCorrectionEngine = defaultEngine) {
  if (running) return;
  running = true;
  try {
    const organizations = await all<{ id: number }>("SELECT id FROM organizations WHERE status='active' ORDER BY id");
    for (const org of organizations) {
      try { await runWithOrganizationContext(Number(org.id), () => processCampaignCorrectionForOrganization(engine)); }
      catch { console.error(`Falha na fila de correção de anúncios da organização ${org.id}; consulte o histórico.`); }
    }
  } finally { running = false; }
}

export async function processCampaignCorrectionForOrganization(engine: CampaignCorrectionEngine = defaultEngine) {
  // Never automatically retry an interrupted paid call.
  await run("UPDATE campaign_image_corrections SET status='failed',error_message='A execução foi interrompida. A arte anterior foi mantida. Solicite uma nova correção se necessário.',finished_at=CURRENT_TIMESTAMP WHERE status='processing' AND started_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'");
  const job = await transaction(db => get<Correction>(`WITH candidate AS (
    SELECT id FROM campaign_image_corrections WHERE status='queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE campaign_image_corrections SET status='processing',started_at=CURRENT_TIMESTAMP
    WHERE id IN(SELECT id FROM candidate) RETURNING *`, undefined, db));
  if (!job) return false;
  try {
    const campaign = await get<CorrectionCampaign>("SELECT * FROM campaigns WHERE id=?", [job.campaign_id]);
    const client = await get<ClientProfile>("SELECT * FROM clients WHERE id=?", [job.client_id]);
    if (!campaign || !client || Number(campaign.client_id) !== Number(job.client_id)) throw new Error("Não foi possível localizar o anúncio e a marca desta correção.");
    if ((campaign.final_image_url || campaign.image_url) !== job.before_image_url) throw new Error("A arte atual mudou. Confira a versão mais recente antes de solicitar outra correção.");
    const references = campaign.visual_selection?.references || [];
    await validateVisualReferences(Number(job.client_id), references, "ads");
    // Prefer the image before logo overlay. Fall back to the final image, never to a fresh unrelated generation.
    let filename: string | undefined;
    for (const url of [...new Set([job.before_generated_image_url, job.before_image_url].filter(Boolean))]) {
      try { const candidate = mediaFilename(url!); await readMedia("generated", candidate); filename = candidate; break; }
      catch (error) { if (!(error instanceof AppError && error.statusCode === 404)) throw error; }
    }
    if (!filename) throw new Error("A arte original está indisponível. Recupere o arquivo antes de solicitar uma correção.");
    const logo = await get<{ id: number; file_url: string }>("SELECT id,file_url FROM client_assets WHERE client_id=? AND type='logo_main' ORDER BY id DESC LIMIT 1", [job.client_id]);
    if (logo) await validateMainLogoFile((await readMedia("uploads", mediaFilename(logo.file_url))).data);
    const creative = JSON.parse(campaign.creative_output_json || campaign.creative_json || "{}");
    const format = campaign.formato || "1:1";
    const prompt = buildCampaignCorrectionPrompt(client, format, creative.prompt_imagem || creative.imagePrompt || "Preservar a direção visual da imagem de referência.", job.note);
    await run("UPDATE campaign_image_corrections SET prompt=? WHERE id=? AND status='processing'", [prompt, job.id]);
    const image = await engine.image(prompt, format, { clientId: Number(job.client_id), campaignId: Number(job.campaign_id), operationType: "reprocessamento" }, {
      references, mode: campaign.visual_selection?.mode || "reference", no_people: Boolean(campaign.visual_selection?.no_people), creative_filename: filename, require_creative: true
    });
    await validateVisualReferences(Number(job.client_id), references, "ads");
    const pipeline = await getLatestCampaignPipelineRun(Number(job.campaign_id));
    const output = pipeline?.artifacts.filter(artifact => artifact.artifact_type === "creative_output" && artifact.status === "completed").slice(-1)[0]?.payload as { brandOverlay?: { preferredPosition: string; sizePercent: number } } | undefined;
    const preferredPosition = output?.brandOverlay?.preferredPosition;
    const position = preferredPosition && ["top_left", "top_right", "bottom_left", "bottom_right", "bottom_center"].includes(preferredPosition) ? preferredPosition : "bottom_right";
    const size = output?.brandOverlay?.sizePercent;
    const overlay = await engine.overlay({ campaignId: Number(job.campaign_id), clientId: Number(job.client_id), pipelineRunId: Number(pipeline?.id || 0), generatedImagePath: image.imagePath, generatedImageUrl: image.imageUrl,
      overlay: { logoRequired: Boolean(logo), preferredPosition: position, sizePercent: size && Number.isInteger(size) && size >= 8 && size <= 20 ? size : 14 } });
    if (logo && !overlay.applied) throw new Error("Não foi possível aplicar a logo oficial. Confira o arquivo da marca antes de tentar novamente; a arte anterior foi mantida.");
    await transaction(async db => {
      const current = await get<CampaignRecord>("SELECT * FROM campaigns WHERE id=? FOR UPDATE", [job.campaign_id], db);
      const active = await get<Correction>("SELECT * FROM campaign_image_corrections WHERE id=? FOR UPDATE", [job.id], db);
      if (active?.status !== "processing") return;
      if (!current || (current.final_image_url || current.image_url) !== job.before_image_url) throw new Error("A versão do anúncio mudou durante a correção. A nova imagem não substituiu a arte atual.");
      await run("UPDATE campaigns SET image_url=?,image_path=?,final_image_url=?,creative_status='waiting_review',updated_at=CURRENT_TIMESTAMP WHERE id=?", [image.imageUrl, image.imagePath, overlay.finalImageUrl, job.campaign_id], db);
      await run("UPDATE campaign_image_corrections SET status='completed',image_url=?,generated_image_url=?,image_path=?,finished_at=CURRENT_TIMESTAMP,error_message=NULL WHERE id=?", [overlay.finalImageUrl, image.imageUrl, image.imagePath, job.id], db);
    });
  } catch (error) {
    await run("UPDATE campaign_image_corrections SET status='failed',error_message=?,finished_at=CURRENT_TIMESTAMP WHERE id=? AND status='processing'", [error instanceof Error ? error.message : "Não foi possível corrigir a arte. A versão anterior foi mantida.", job.id]);
  }
  return true;
}
