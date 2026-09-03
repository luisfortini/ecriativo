import dotenv from "dotenv";
import { Pool } from "pg";
import type { CreativeBrief, CreativeOutput } from "../contracts/index.js";
import type { PlannerPlan } from "../services/campaignPlannerService.js";
import type { NormalizedBriefing } from "../types.js";

dotenv.config();
dotenv.config({ path: "backend/.env", override: false });

async function main() {
  const stagingUrl = process.env.STAGING_DATABASE_URL?.trim();
  if (!stagingUrl) throw new Error("STAGING_DATABASE_URL não está configurada.");

  const schema = `smoke_improvements_${Date.now()}`;
  if (!/^smoke_improvements_\d+$/.test(schema)) throw new Error("Nome de schema de teste inválido.");

  const adminPool = new Pool({ connectionString: stagingUrl, max: 1 });
  let applicationPool: { end: () => Promise<void> } | undefined;
  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    const isolatedUrl = new URL(stagingUrl);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = isolatedUrl.toString();
    delete process.env.ADMIN_NAME;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;

    const [{ migrate }, db, costs, planner, campaigns, promptContext, zoned] = await Promise.all([
      import("../db/migrate.js"),
      import("../db/connection.js"),
      import("../services/aiCostService.js"),
      import("../services/campaignPlannerService.js"),
      import("../services/campaignService.js"),
      import("../services/clientPromptContextService.js"),
      import("../utils/zonedDateTime.js")
    ]);
    applicationPool = db.pool;
    await migrate();

    const timezonePlan: PlannerPlan = {
      id: 999,
      name: "Fuso Smoke",
      theme: "Fuso",
      strategic_description: null,
      objective: "Validar fuso",
      start_date: "2026-09-02",
      end_date: "2026-09-03",
      recurrence_type: "once",
      recurrence_days_json: "[0,1,2,3,4,5,6]",
      preferred_time: "09:00",
      ads_per_client: 3,
      ad_format: "1:1",
      max_ads_per_day: 30,
      max_ads_per_hour: 50,
      min_interval_minutes: 1,
      approval_mode: "waiting_review",
      variation_mode: "sazonal",
      status: "draft"
    };
    const timezoneSchedule = planner.buildSchedule(timezonePlan, 3, new Date("2026-09-03T01:56:00.000Z"));
    assert(timezoneSchedule.length === 3, "O planejamento deveria manter vagas no dia 02/09 no fuso de São Paulo.");
    assert(zoned.zonedDateKey(timezoneSchedule[0], "America/Sao_Paulo") === "2026-09-02", "A data agendada não respeitou o fuso do planejador.");

    const normalized = {
      color_palette: "#5A0000, #6C464A, #FFFCF6",
      extracted_palette: "",
      forbidden_colors: "#000000",
      preferred_typography: ""
    } as NormalizedBriefing;
    const constrainedBrief = campaigns.enforceBrandConstraints({
      visualDirection: { colorPalette: ["preto", "dourado"] }
    } as unknown as CreativeBrief, normalized);
    assert(constrainedBrief.visualDirection.colorPalette[0] === "#5A0000", "A paleta atual do cliente não prevaleceu no briefing criativo.");
    const imagePrompt = campaigns.buildImageGenerationPrompt({
      imagePrompt: "Criativo de teste.",
      negativePrompt: "texto ilegível"
    } as unknown as CreativeOutput, normalized);
    assert(imagePrompt.includes("#5A0000") && imagePrompt.includes("#FFFCF6"), "O prompt final da imagem não recebeu a paleta do cliente.");

    const clientInsert = await db.run("INSERT INTO clients (name, segment) VALUES (?, ?)", ["Cliente Smoke", "Testes"]);
    const clientId = Number(clientInsert.lastInsertRowid);
    const userInsert = await db.run(
      "INSERT INTO users (name, email, password_hash, role, active) VALUES (?, ?, ?, 'admin', TRUE)",
      ["Revisor Smoke", "smoke@example.test", "hash-de-teste"]
    );
    const userId = Number(userInsert.lastInsertRowid);

    await costs.upsertAiModelPrice({
      model: "smoke-model",
      input_price_per_1m_tokens: 2,
      output_price_per_1m_tokens: 3,
      image_price: 4,
      currency: "usd",
      active: true
    });
    const usageId = await costs.recordAiUsage({
      clientId,
      model: "smoke-model",
      operationType: "agente",
      status: "success",
      inputTokens: 1_000_000,
      outputTokens: 2_000_000,
      imageCount: 1
    });
    const usage = await db.get<{ total_estimated_cost: number }>("SELECT total_estimated_cost FROM ai_usage_logs WHERE id = ?", [usageId]);
    assert(Number(usage?.total_estimated_cost) === 12, "O custo calculado deveria ser 12.");

    const tomorrow = new Date(Date.now() + 86_400_000);
    const end = new Date(Date.now() + 7 * 86_400_000);
    const planInput = {
      name: "Plano Smoke",
      theme: "Tema inicial",
      strategic_description: "Validação isolada",
      objective: "Validar edição",
      start_date: zoned.zonedDateKey(tomorrow, "America/Sao_Paulo"),
      end_date: zoned.zonedDateKey(end, "America/Sao_Paulo"),
      recurrence_type: "daily" as const,
      recurrence_days: [],
      preferred_time: "09:00",
      ads_per_client: 2,
      ad_format: "1:1" as const,
      max_ads_per_day: 5,
      max_ads_per_hour: 5,
      min_interval_minutes: 5,
      approval_mode: "waiting_review" as const,
      variation_mode: "sazonal",
      status: "draft" as const,
      clients: [{ client_id: clientId, ads_quantity: 2 }]
    };
    const createdPlan = await planner.createPlan(planInput) as unknown as { id: number };
    await planner.activatePlan(createdPlan.id);
    await planner.pausePlan(createdPlan.id);
    const updatedPlan = await planner.updatePlan(createdPlan.id, {
      ...planInput,
      theme: "Tema editado",
      ads_per_client: 3,
      status: "paused",
      clients: [{ client_id: clientId, ads_quantity: 3 }]
    }) as unknown as { theme: string; status: string; queue: Array<{ status: string }> };
    assert(updatedPlan.theme === "Tema editado" && updatedPlan.status === "paused", "O plano pausado não foi editado corretamente.");
    assert(updatedPlan.queue.filter((item) => item.status === "pending").length === 3, "A fila futura não foi recalculada.");
    const duplicatedPlan = await planner.duplicatePlan(createdPlan.id) as unknown as { status: string; queue: unknown[] };
    assert(duplicatedPlan.status === "draft" && duplicatedPlan.queue.length === 0, "A duplicação deveria criar um rascunho sem fila.");

    const firstCampaign = await insertCampaign(db, clientId, "https://example.test/arte-1.png");
    const secondCampaign = await insertCampaign(db, clientId, "https://example.test/arte-2.png");
    let missingReasonRejected = false;
    try {
      await campaigns.updateCampaignStatus(firstCampaign, "rejected", undefined, userId);
    } catch {
      missingReasonRejected = true;
    }
    assert(missingReasonRejected, "A reprovação sem motivo deveria ser recusada.");
    await campaigns.updateCampaignStatus(firstCampaign, "approved", "A composição ficou clara.", userId);
    const reviewed = await campaigns.updateCampaignStatus(firstCampaign, "rejected", "Evitar excesso de texto.", userId) as { reviews: unknown[] };
    assert(reviewed.reviews.length === 2, "O histórico deveria conter duas avaliações.");
    const context = await promptContext.buildClientPromptContext(clientId);
    assert(String(context.aprendizados_recentes).includes("Evitar excesso de texto"), "O motivo não entrou no aprendizado do cliente.");
    const navigation = await campaigns.getCreativeNavigation(firstCampaign);
    assert(
      navigation?.previous_id === secondCampaign,
      `A navegação entre criativos não encontrou o item seguinte da lista: ${JSON.stringify({ firstCampaign, secondCampaign, navigation })}`
    );

    console.log(JSON.stringify({ status: "ok", checks: ["fuso", "paleta", "custos", "planejador", "duplicação", "avaliações", "aprendizado", "navegação"] }));
  } finally {
    if (applicationPool) await applicationPool.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.end();
  }
}

async function insertCampaign(
  db: { run: (sql: string, params?: unknown[]) => Promise<{ lastInsertRowid?: number }> },
  clientId: number,
  imageUrl: string
) {
  const result = await db.run(
    `INSERT INTO campaigns (client_id, cliente, strategy_json, creative_json, image_url, final_image_url, status)
     VALUES (?, ?, '{}', '{}', ?, ?, 'completed')`,
    [clientId, "Cliente Smoke", imageUrl, imageUrl]
  );
  return Number(result.lastInsertRowid);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
