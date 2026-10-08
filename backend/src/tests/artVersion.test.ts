import assert from "node:assert/strict";
import {test} from "node:test";
import {restoreAdSchema,restoreSocialSchema} from "../services/artVersionService.js";
test("anúncio só aceita uma versão do histórico e a base visível",()=>{
  assert.equal(restoreAdSchema.safeParse({correction_id:1,version:"before",base_image_url:"original.png"}).success,true);
  for(const input of [{correction_id:0,version:"before",base_image_url:"x"},{correction_id:1,version:"other",base_image_url:"x"},{correction_id:1,version:"before"}])assert.equal(restoreAdSchema.safeParse(input).success,false);
});
test("social exige índice não negativo e revisão/base para conflito de edição",()=>{
  assert.equal(restoreSocialSchema.safeParse({version_index:0,revision_count:1,base_image_urls:["new.png"]}).success,true);
  assert.equal(restoreSocialSchema.safeParse({version_index:-1,revision_count:1,base_image_urls:[]}).success,false);
  assert.equal(restoreSocialSchema.safeParse({version_index:0,base_image_urls:[]}).success,false);
});
