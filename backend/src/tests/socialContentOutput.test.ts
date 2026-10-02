import assert from "node:assert/strict";
import { test } from "node:test";
import { generateValidatedSocialContent, type SocialTextResponse } from "../services/socialContentOutput.js";

const valid = (count = 1) => ({caption:"Uma legenda útil.",alt_text:"Produto original.",image_prompts:Array.from({length:count},()=> "Produto original em fundo azul, com texto legível.")});
const response = (data: unknown): SocialTextResponse => ({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(data)}]}]});

test("conteúdo válido não gera uma segunda chamada",async()=>{
  let calls=0;
  const result=await generateValidatedSocialContent("post",async repair=>{calls++;assert.equal(repair,"");return response(valid());});
  assert.equal(calls,1);assert.deepEqual(result,valid());
});
test("prompt de 8001 caracteres solicita ajuste e usa a nova versão inteira",async()=>{
  let calls=0;
  const compact=valid();compact.image_prompts=["p".repeat(5000)+" FIM PRESERVADO"];
  const result=await generateValidatedSocialContent("post",async repair=>{
    calls++;
    if(calls===1)return response({...valid(),image_prompts:["p".repeat(8001)]});
    assert.match(repair,/arte 1/);assert.match(repair,/1500 caracteres/);assert.match(repair,/características obrigatórias/);
    return response(compact);
  });
  assert.equal(calls,2);assert.deepEqual(result,compact);
});
test("limite inclusivo de 8000 caracteres continua válido",async()=>{
  const data={...valid(),image_prompts:["p".repeat(8000)]};
  assert.deepEqual(await generateValidatedSocialContent("post",async()=>response(data)),data);
});
test("duas respostas longas encerram a tentativa com mensagem compreensível",async()=>{
  let calls=0;
  await assert.rejects(generateValidatedSocialContent("carousel",async()=>{calls++;const data=valid(3);data.image_prompts[1]="p".repeat(8001);return response(data);}),error=>{
    assert.ok(error instanceof Error);assert.match(error.message,/arte 2/);assert.match(error.message,/tentativa automática/);assert.doesNotMatch(error.message,/too_big|image_prompts|Zod/);return true;
  });
  assert.equal(calls,2);
});
test("carrossel conserva exatamente três artes e a ordem",async()=>{
  const data=valid(3);data.image_prompts=["Primeira arte original.","Segunda arte original.","Terceira arte original."];
  assert.deepEqual(await generateValidatedSocialContent("carousel",async()=>response(data)),data);
});
test("quantidade incorreta de artes não passa silenciosamente",async()=>{
  let calls=0;
  await assert.rejects(generateValidatedSocialContent("carousel",async()=>{calls++;return response(valid(1));}),/formato ou os limites/);
  assert.equal(calls,2);
});
test("limites da legenda e texto alternativo também são recuperáveis",async()=>{
  for(const field of ["caption","alt_text"] as const){
    let calls=0;
    const result=await generateValidatedSocialContent("post",async()=>{calls++;return response(calls===1?{...valid(),[field]:"x".repeat(field==="caption"?10001:3001)}:valid());});
    assert.equal(calls,2);assert.deepEqual(result,valid());
  }
});
test("JSON inválido e resposta interrompida recebem no máximo uma recuperação",async()=>{
  for(const initial of [
    {status:"completed",output:[{type:"message",content:[{type:"output_text",text:'{"caption":'}]}]},
    {...response(valid()),status:"incomplete",incomplete_details:{reason:"max_output_tokens"}}
  ]){
    let calls=0;
    const result=await generateValidatedSocialContent("post",async()=>{calls++;return calls===1?initial:response(valid());});
    assert.equal(calls,2);assert.deepEqual(result,valid());
  }
});
test("recusas e filtro de segurança não são contornados por tentativas extras",async()=>{
  for(const first of [
    {status:"completed",output:[{type:"message",content:[{type:"refusal"}]}]},
    {status:"incomplete",incomplete_details:{reason:"content_filter"},output:[]}
  ]){
    let calls=0;
    await assert.rejects(generateValidatedSocialContent("post",async()=>{calls++;return first;}),/restrição de segurança/);
    assert.equal(calls,1);
  }
});
test("falhas de rede e provedor não provocam cobranças por novas tentativas",async()=>{
  let calls=0;
  await assert.rejects(generateValidatedSocialContent("post",async()=>{calls++;throw new Error("HTTP 429");}),/HTTP 429/);
  assert.equal(calls,1);
  await assert.rejects(generateValidatedSocialContent("post",async()=>({status:"failed",output:[]})),/não foi concluída/);
});
