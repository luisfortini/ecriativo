import assert from "node:assert/strict";
import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config({ path: process.env.CORRECTION_TEST_ENV || "backend/.env" });

async function main() {
  const staging = process.env.STAGING_DATABASE_URL || (process.env.CORRECTION_TEST_ENV ? process.env.DATABASE_URL : undefined);
  if (!staging) throw new Error("Configure STAGING_DATABASE_URL ou indique explicitamente CORRECTION_TEST_ENV para o banco de testes autorizado.");
  const schema = "smoke_campaign_corrections_" + Date.now();
  const admin = new Pool({ connectionString: staging, max: 1 });
  let appPool: Pool | undefined, created = false;
  try {
    await admin.query('CREATE SCHEMA "' + schema + '"'); created = true;
    const url = new URL(staging); url.searchParams.set("options", "-c search_path=" + schema);
    process.env.DATABASE_URL = url.toString(); process.env.OPENAI_API_KEY = "";
    process.env.ADMIN_NAME = ""; process.env.ADMIN_EMAIL = ""; process.env.ADMIN_PASSWORD = "";
    process.env.JWT_SECRET = "isolated-correction-test-secret-at-least-32";
    const db = await import("../db/connection.js"); appPool = db.pool;
    const { migrate } = await import("../db/migrate.js"); await migrate(); await db.validateTenantRole();
    const service = await import("../services/campaignCorrectionService.js");
    const campaigns = await import("../services/campaignService.js");
    const { persistMedia } = await import("../services/mediaStorageService.js");
    const { createOrganization } = await import("../services/organizationService.js");
    const { createClient } = await import("../services/clientService.js");
    const userId = Number((await db.run("INSERT INTO users(name,email,password_hash,role,active) VALUES('Teste','correction@test.invalid','fixture','user',TRUE)")).lastInsertRowid);
    const orgA = await createOrganization(userId, "Agência A", "agency");
    const orgB = await createOrganization(userId, "Agência B", "agency");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH0kAAAAASUVORK5CYII=", "base64");
    let campaignId = 0, clientId = 0, calls = 0, correctionId = 0;
    const engine: import("../services/campaignCorrectionService.js").CampaignCorrectionEngine = {
      image: async (prompt, format, metadata, visual) => {
        calls++; assert.equal(format, "4:5"); assert.equal(metadata?.campaignId, campaignId);
        assert.equal(visual?.require_creative, true); assert.equal(visual?.creative_filename, "original.png");
        assert.ok(prompt.includes("English (US)")); assert.ok(prompt.includes("+1 401-555-0123"));
        const name = "corrected-" + calls + ".png"; await persistMedia("generated", name, png);
        return { imagePath: "/fixture/" + name, imageUrl: "https://fixture.invalid/generated/" + name };
      },
      overlay: async input => ({ applied: false, finalImagePath: input.generatedImagePath, finalImageUrl: input.generatedImageUrl })
    };
    const raw = () => db.get<{ image_url: string; final_image_url: string; creative_status: string }>("SELECT image_url,final_image_url,creative_status FROM campaigns WHERE id=?", [campaignId]);
    const request = (note = "Aumentar o título") => service.requestCampaignCorrection(campaignId, { note, base_image_url: "https://fixture.invalid/generated/original-final.png" }, userId);
    await db.runWithOrganizationContext(orgA.id, async () => {
      clientId = Number((await createClient({ name: "Marca A", content_language: "English (US)", contact_phone: "+1 401-555-0123", color_palette: "Azul e branco" }))!.id);
      campaignId = Number((await db.run("INSERT INTO campaigns(client_id,cliente,formato,image_url,final_image_url,status,creative_status,strategy_json,creative_json) VALUES(?,?,'4:5',?,?,'completed','approved',?,?)", [clientId,"Marca A","https://fixture.invalid/generated/original.png","https://fixture.invalid/generated/original-final.png",JSON.stringify({ headline: "Oferta original", texto_principal: "Legenda original" }),JSON.stringify({ prompt_imagem: "Arte original" })])).lastInsertRowid);
      await persistMedia("generated", "original.png", png); await persistMedia("generated", "original-final.png", png);
      const simultaneous = await Promise.allSettled([request(), request()]);
      assert.equal(simultaneous.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(simultaneous.filter(result => result.status === "rejected").length, 1);
      correctionId = Number((await db.get<{id:number}>("SELECT id FROM campaign_image_corrections WHERE campaign_id=?", [campaignId]))!.id);
      await assert.rejects(() => campaigns.updateCampaignStatus(campaignId,"approved",undefined,userId), /correção terminar/);
      assert.equal((await raw())!.creative_status, "approved");
    });
    await db.runWithOrganizationContext(orgB.id, async () => {
      assert.equal(await campaigns.getCampaign(campaignId), null);
      await assert.rejects(() => request(), /não encontrado/);
      assert.equal((await db.all("SELECT * FROM campaign_image_corrections")).length, 0);
      const brandB = Number((await createClient({name:"Marca B"}))!.id);
      await assert.rejects(() => db.transaction(client => db.run("INSERT INTO campaign_image_corrections(campaign_id,client_id,note,before_image_url,status) VALUES(?,?,'Pedido de teste','x','failed')", [campaignId,brandB],client)), /foreign key/);
    });
    await db.runWithOrganizationContext(orgA.id, async () => {
      await service.processCampaignCorrectionForOrganization({ ...engine, image: async () => { throw new Error("Falha simulada do provedor"); } });
      assert.equal((await db.get<{status:string}>("SELECT status FROM campaign_image_corrections WHERE id=?",[correctionId]))!.status,"failed");
      assert.equal((await raw())!.final_image_url,"https://fixture.invalid/generated/original-final.png");
      assert.equal((await raw())!.creative_status,"approved");
      await assert.rejects(() => service.requestCampaignCorrection(campaignId,{note:"Outro ajuste",base_image_url:"https://fixture.invalid/generated/old.png"},userId), /atualizada/);
      // Only disposable DB bytes are used: an invalid logo must fail before charging for an image.
      await persistMedia("uploads", "invalid-logo.svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>'));
      const invalidLogoId = (await db.run("INSERT INTO client_assets(client_id,type,file_url) VALUES(?,'logo_main','https://fixture.invalid/uploads/invalid-logo.svg')",[clientId])).lastInsertRowid;
      await request(); await service.processCampaignCorrectionForOrganization(engine);
      assert.equal(calls,0);
      assert.match((await db.get<{error_message:string}>("SELECT error_message FROM campaign_image_corrections WHERE campaign_id=? ORDER BY id DESC LIMIT 1",[campaignId]))!.error_message,/PNG/);
      await db.run("DELETE FROM client_assets WHERE id=?",[invalidLogoId]);
      await request();
      assert.equal(await service.processCampaignCorrectionForOrganization(engine), true);
      assert.equal(calls,1);
      assert.equal((await raw())!.creative_status,"waiting_review");
      assert.equal((await raw())!.final_image_url,"https://fixture.invalid/generated/corrected-1.png");
      const detail = await campaigns.getCampaign(campaignId);
      assert.equal(detail!.strategy.texto_principal,"Legenda original");
      assert.equal(detail!.image_corrections.length,3);
      assert.equal(detail!.image_corrections[0].before_image_url,"https://fixture.invalid/generated/original-final.png");
      await campaigns.updateCampaignStatus(campaignId,"approved",undefined,userId);
      await service.requestCampaignCorrection(campaignId,{note:"Novo ajuste visual",base_image_url:(await raw())!.final_image_url},userId);
      await db.run("UPDATE campaign_image_corrections SET status='processing',started_at=CURRENT_TIMESTAMP-INTERVAL '31 minutes' WHERE status='queued'");
      assert.equal(await service.processCampaignCorrectionForOrganization(engine),false);
      assert.equal(calls,1); // Interrupted operations are not charged again automatically.
      assert.equal((await raw())!.final_image_url,"https://fixture.invalid/generated/corrected-1.png");
      const second = Number((await db.run("INSERT INTO campaigns(client_id,formato,image_url,status) VALUES(?,'4:5','https://fixture.invalid/generated/missing.png','completed')",[clientId])).lastInsertRowid);
      await service.requestCampaignCorrection(second,{note:"Corrigir a arte ausente",base_image_url:"https://fixture.invalid/generated/missing.png"},userId);
      await service.processCampaignCorrectionForOrganization(engine);
      assert.equal(calls,1); // Missing source is rejected before requesting a paid image.
      assert.match((await db.get<{error_message:string}>("SELECT error_message FROM campaign_image_corrections WHERE campaign_id=?",[second]))!.error_message,/original está indisponível/);
    });
    console.log("PASS: migration/RLS and cross-tenant FK, duplicate requests, pending approval guard, failure preservation, stale version conflict, successful correction/history/reapproval, unchanged caption, interrupted-call recovery, invalid-logo and missing-source protection. No paid API calls.");
  } finally {
    await appPool?.end();
    if (created) {
      if (!/^smoke_campaign_corrections_\d+$/.test(schema)) throw new Error("Unexpected test schema.");
      await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
      console.log("Área temporária de teste removida; cadastros existentes preservados.");
    }
    await admin.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Teste falhou"); process.exitCode = 1; });
