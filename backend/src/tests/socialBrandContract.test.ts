import assert from "node:assert/strict";
import {test} from "node:test";
import type {ClientProfile} from "../types.js";
import {socialContentLanguage,socialImagePrompt,socialBrandContract} from "../services/socialBrandContract.js";

const brand={name:"L.I Star Cleaning",content_language:"English (US)",brand_voice:"Conteúdo em português",color_palette:"Verde #205b38 e branco",preferred_typography:"Serifada elegante",forbidden_colors:"Azul",approved_styles:"Minimalista"} as ClientProfile;
test("idioma explícito prevalece sobre cadastro legado",()=>{
  assert.equal(socialContentLanguage(brand),"English (US)");
  assert.equal(socialContentLanguage({...brand,content_language:"",brand_voice:"Textos em inglês"}),"English");
  assert.equal(socialContentLanguage({...brand,content_language:"",brand_voice:"Acolhedor",country:"USA"}),"Português brasileiro");
});
test("todas as artes recebem as mesmas regras e a correção usa o perfil atual",()=>{
  const prompts=[0,1,2].map(index=>socialImagePrompt(brand,"Texto antigo em português, fundo azul",index,3,"Margens uniformes e serifada","Corrigir a identidade"));
  for(const [index,prompt] of prompts.entries()){
    assert.ok(prompt.includes(`arte ${index+1} de 3`));
    assert.ok(prompt.includes(socialBrandContract(brand)));
    assert.match(prompt,/exclusivamente em English \(US\)/);
    assert.match(prompt,/prevalecem sobre prompts antigos/);
    assert.match(prompt,/Não invente logotipos/);
    assert.match(prompt,/Margens uniformes e serifada/);
  }
});
