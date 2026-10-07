import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { brandContactFields, brandContactContext, normalizeContactPhone } from "../services/brandContact.js";
import { socialBrandContract, socialImagePrompt } from "../services/socialBrandContract.js";
import type { ClientProfile } from "../types.js";

const schema = z.object(brandContactFields);
test("números internacionais e locais conservam código e formatação", () => {
  for(const phone of ["401-347-8579","401-555-0123","+1 (401) 555-0123","+44 20 7946 0958","+351 912 345 678","+55 (11) 99999-9999","001 401 555 0123","(401) 555-0123"]) {
    assert.equal(schema.parse({contact_phone:phone}).contact_phone,phone);
  }
});
test("telefone copiado aceita variantes Unicode sem inventar código do país", () => {
  for(const separator of ["\u2010","\u2011","\u2012","\u2013","\u2014","\u2212"]) {
    assert.equal(schema.parse({contact_phone:"401"+separator+"555"+separator+"0123"}).contact_phone,"401-555-0123");
  }
  assert.equal(schema.parse({contact_phone:"\u200e＋１ (４０１) ５５５‑０１２３\u200b"}).contact_phone,"+1 (401) 555-0123");
  assert.equal(schema.parse({contact_phone:"+351\u00a0912\u202f345\u00a0678"}).contact_phone,"+351 912 345 678");
  assert.equal(normalizeContactPhone("  \u200e\u200b  "),"");
});
test("mensagem do telefone mostra exemplos sem impor código brasileiro", () => {
  for(const phone of ["++1 401 555 0123","401+5550123","401-ABC-0123","123","x".repeat(41)]) {
    assert.equal(schema.safeParse({contact_phone:phone}).success,false);
  }
  const error=schema.safeParse({contact_phone:"123"});
  if(!error.success)assert.match(error.error.issues[0].message,/401-555-0123/);
});
test("contatos públicos opcionais e Instagram normalizado", () => {
  assert.deepEqual(schema.parse({}), {});
  assert.equal(schema.parse({instagram_handle:" @cafe.da_serra "}).instagram_handle, "cafe.da_serra");
  assert.equal(schema.parse({contact_phone:"+55 (19) 99999-9999"}).contact_phone, "+55 (19) 99999-9999");
  assert.ok(schema.safeParse({contact_phone:"",instagram_handle:"",address:""}).success);
});
test("contatos inválidos são rejeitados com mensagem clara", () => {
  for (const input of [{instagram_handle:"https://instagram.com/cafe"}, {instagram_handle:"nome com espaço"}, {contact_phone:"123"}, {contact_phone:"texto"}, {address:"x".repeat(501)}]) {
    const result=schema.safeParse(input);
    assert.equal(result.success,false);
    if(!result.success)assert.ok(result.error.issues[0].message.length>10);
  }
});
test("geração e correção recebem apenas o contato cadastrado da marca", () => {
  const brand = {name:"Café da Serra",content_language:"English (US)",contact_phone:"+55 19 99999-9999",instagram_handle:"cafedaserra",address:"Rua das Flores, 10 · Campinas"} as ClientProfile;
  const contact=brandContactContext(brand);
  assert.equal(contact.instagram,"@cafedaserra");
  assert.equal(contact.endereco,brand.address);
  assert.match(contact.uso,/Nunca invente/);
  for(const index of [0,1,2]){
    const prompt=socialImagePrompt(brand,"Texto da arte",index,3,"Identidade compartilhada","Corrigir arte");
    assert.ok(prompt.includes(brand.contact_phone!));
    assert.ok(prompt.includes("@cafedaserra"));
    assert.ok(prompt.includes(brand.address!));
    assert.ok(prompt.includes("English (US)"));
  }
  assert.equal(JSON.parse(socialBrandContract({name:"Outra marca"} as ClientProfile)).public_contact.telefone,undefined);
});
