import assert from "node:assert/strict";
import { test } from "node:test";
import { styleCandidates } from "../services/creationDirectionService.js";
import { creationBrandRules, socialImagePrompt } from "../services/socialBrandContract.js";
import { visualSelectionSchema } from "../services/visualLibraryService.js";
import type { ClientProfile } from "../types.js";

const assets = [
  { id: 11, type: "logo_main", file_url: "logo.png" },
  { id: 10, type: "reference_image", file_url: "reference.png" },
  { id: 4, type: "approved_ad", file_url: "approved.png" },
  { id: 3, type: "approved_reference", file_url: "style.png" },
  { id: 12, type: "rejected_reference", file_url: "rejected.png" }
];
test("anúncios e social compartilham a prioridade, sem usar logo ou referência rejeitada como estilo", () => {
  assert.deepEqual(styleCandidates(assets).map(asset=>asset.id),[4,3,10]);
  assert.equal(assets[0].id,11); // Does not mutate the original gallery.
  assert.deepEqual(styleCandidates(assets,10).map(asset=>asset.id),[10]);
  assert.throws(()=>styleCandidates(assets,12),/não pertence/);
  assert.throws(()=>styleCandidates(assets,999),/não pertence/);
});
test("seleção de estilo é opcional em registros antigos e persistida quando explícita", () => {
  assert.equal(visualSelectionSchema.parse({}).style_asset_id,undefined);
  assert.equal(visualSelectionSchema.parse({style_asset_id:"10"}).style_asset_id,10);
  assert.equal(visualSelectionSchema.parse({style_asset_id:null}).style_asset_id,null);
  assert.equal(visualSelectionSchema.safeParse({style_asset_id:-1}).success,false);
});
test("o contrato compartilhado define idioma, contatos e proteção contra assinatura de outra empresa", () => {
  const brand={name:"Marca A",content_language:"English (US)",color_palette:"Azul escuro e branco",contact_phone:"+1 401-347-8579",instagram_handle:"marca.a",address:"Rhode Island"} as ClientProfile;
  const common=creationBrandRules(brand);
  assert.ok(socialImagePrompt(brand,"Pauta",0,3).includes(common));
  assert.match(common,/exclusivamente em English \(US\)/);
  assert.match(common,/\+1 401-347-8579/);
  assert.match(common,/Não copie seu assunto/);
  assert.match(common,/Não invente logotipos/);
});
