import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignCorrectionSchema, buildCampaignCorrectionPrompt } from "../services/campaignCorrectionContract.js";
import type { ClientProfile } from "../types.js";

test("correção exige descrição útil e identifica a versão visível", () => {
  assert.equal(campaignCorrectionSchema.safeParse({ note: "  ", base_image_url: "x" }).success, false);
  assert.equal(campaignCorrectionSchema.safeParse({ note: "a".repeat(2001), base_image_url: "x" }).success, false);
  assert.equal(campaignCorrectionSchema.safeParse({ note: "Aumentar o título" }).success, false);
  assert.equal(campaignCorrectionSchema.parse({ note: "  Aumentar o título  ", base_image_url: "https://example.invalid/generated/a.png" }).note, "Aumentar o título");
});

test("edição preserva formato, idioma e contato atuais, sem recriar a logo", () => {
  const client = { name: "Marca teste", content_language: "English (US)", color_palette: "Azul e branco", contact_phone: "+1 (401) 555-0123", instagram_handle: "minhamarca", address: "Rhode Island" } as ClientProfile;
  const prompt = buildCampaignCorrectionPrompt(client, "4:5", "Use paleta laranja e texto em português", "Increase the headline size");
  for (const text of ["4:5", "English (US)", "Azul e branco", "+1 (401) 555-0123", "@minhamarca", "Rhode Island", "Increase the headline size", "Não desenhe nem recrie logos", "somente a arte, não a legenda", "sem bordas externas"]) assert.ok(prompt.includes(text), text);
  assert.ok(prompt.indexOf("PERFIL ATUAL") > prompt.indexOf("paleta laranja"));
});

test("contexto antigo é limitado sem truncar o pedido de correção", () => {
  const prompt = buildCampaignCorrectionPrompt({ name: "Marca", content_language: "Español" } as ClientProfile, "9:16", "x".repeat(50000), "Corrigir o telefone exibido");
  assert.ok(prompt.length < 16000);
  assert.ok(prompt.includes("Corrigir o telefone exibido"));
  assert.ok(prompt.includes("Español"));
});

test("edição estrita sem referência não vira geração ou placeholder", async () => {
  const { generateImage } = await import("../services/openaiService.js");
  await assert.rejects(() => generateImage("Aumentar título", "4:5", undefined, { references: [], mode: "reference", no_people: false, require_creative: true }), /precisa da imagem original/);
});
