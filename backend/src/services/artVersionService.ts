import { z } from "zod";
import { get, run, transaction } from "../db/connection.js";
import { AppError } from "../utils/errors.js";
import { mediaFilename, readMedia } from "./mediaStorageService.js";
import { assertContentNotScheduled } from "./socialPublishingService.js";

export const restoreAdSchema=z.object({correction_id:z.coerce.number().int().positive(),version:z.enum(["before","after"]),base_image_url:z.string().min(1).max(2000)});
export const restoreSocialSchema=z.object({version_index:z.number().int().min(0),revision_count:z.number().int().positive(),base_image_urls:z.array(z.string().max(2000)).max(3)});

async function requireImage(url:string) {
  try {await readMedia("generated",mediaFilename(url));}
  catch(error) {if(error instanceof AppError&&error.statusCode===404)throw new AppError("O arquivo desta versão está indisponível. Recupere-o do backup antes de restaurar. A versão atual foi mantida.",422);throw error;}
}

export async function restoreAdVersion(id:number,raw:unknown,userId:number|null) {
  const parsed=restoreAdSchema.safeParse(raw);
  if(!parsed.success)throw new AppError("Selecione uma versão válida do histórico.",422);
  const input=parsed.data;
  return transaction(async db=>{
    const current=await get<{client_id:number;status:string;image_url:string;final_image_url:string;image_path:string|null}>("SELECT * FROM campaigns WHERE id=? FOR UPDATE",[id],db);
    if(!current)throw new AppError("Anúncio não encontrado.",404);
    if(current.status!=="completed")throw new AppError("Aguarde a geração terminar antes de trocar a versão.",409);
    if(await get("SELECT id FROM campaign_image_corrections WHERE campaign_id=? AND status IN ('queued','processing')",[id],db))throw new AppError("Aguarde a correção terminar antes de trocar a versão.",409);
    const visible=current.final_image_url||current.image_url;
    if(visible!==input.base_image_url)throw new AppError("A arte foi atualizada. Atualize a tela antes de escolher outra versão.",409);
    const saved=await get<{status:string;before_image_url:string;before_generated_image_url:string|null;before_image_path:string|null;image_url:string|null;generated_image_url:string|null;image_path:string|null}>("SELECT * FROM campaign_image_corrections WHERE id=? AND campaign_id=?",[input.correction_id,id],db);
    if(!saved||saved.status!=="completed")throw new AppError("Versão concluída não encontrada neste anúncio.",404);
    const final=input.version==="before"?saved.before_image_url:saved.image_url;
    const generated=(input.version==="before"?saved.before_generated_image_url:saved.generated_image_url)||final;
    const imagePath=input.version==="before"?saved.before_image_path:saved.image_path;
    if(!final||!generated)throw new AppError("Esta versão não possui uma arte para restaurar.",422);
    if(final===visible)throw new AppError("Esta já é a versão em uso.",409);
    await requireImage(final);
    await requireImage(generated);
    // Reuse the immutable before/after ledger: restoration itself is a completed alteration.
    await run(`INSERT INTO campaign_image_corrections(campaign_id,client_id,user_id,note,status,before_image_url,before_generated_image_url,before_image_path,image_url,generated_image_url,image_path,finished_at)
      VALUES(?,?,?,?,'completed',?,?,?,?,?,?,CURRENT_TIMESTAMP)`,[id,current.client_id,userId,`Versão restaurada do histórico #${input.correction_id} (${input.version==="before"?"antes":"depois"}). Sem nova geração.`,visible,current.image_url,current.image_path,final,generated,imagePath],db);
    await run("UPDATE campaigns SET image_url=?,final_image_url=?,image_path=?,creative_status='waiting_review',updated_at=CURRENT_TIMESTAMP WHERE id=?",[generated,final,imagePath,id],db);
    return {ok:true};
  });
}

interface SocialVersion {
  images:Array<{url:string;[key:string]:unknown}>;caption?:string;alt_text?:string;image_prompts?:string[];
  visual_snapshot?:unknown[];visual_direction?:string;review_note?:string|null;
}
interface SocialCurrent extends SocialVersion {status:string;revisions:SocialVersion[];}

export async function restoreSocialVersion(id:number,raw:unknown,userId:number|null) {
  const parsed=restoreSocialSchema.safeParse(raw);
  if(!parsed.success)throw new AppError("Selecione uma versão válida do histórico.",422);
  const input=parsed.data;
  return transaction(async db=>{
    const current=await get<SocialCurrent&{format:string}>("SELECT * FROM social_contents WHERE id=? FOR UPDATE",[id],db);
    if(!current)throw new AppError("Conteúdo não encontrado.",404);
    if(["pending","processing","draft"].includes(current.status))throw new AppError("Aguarde a produção terminar antes de trocar a versão.",409);
    await assertContentNotScheduled(id);
    if(current.revisions.length!==input.revision_count||JSON.stringify(current.images.map(image=>image?.url||""))!==JSON.stringify(input.base_image_urls))throw new AppError("O conteúdo foi atualizado. Atualize a tela antes de escolher outra versão.",409);
    const target=current.revisions[input.version_index];
    const count=current.format==="carousel"?3:1;
    if(!target||target.images?.length!==count||target.images.some(image=>!image?.url))throw new AppError("Esta versão não tem todas as artes disponíveis para restaurar.",422);
    for(const image of target.images)await requireImage(image.url);
    const snapshot={images:current.images,caption:current.caption,alt_text:current.alt_text,image_prompts:current.image_prompts,visual_snapshot:current.visual_snapshot,visual_direction:current.visual_direction,review_note:current.review_note,status:current.status,at:new Date().toISOString(),restoration:{version_index:input.version_index,user_id:userId}};
    await run(`UPDATE social_contents SET revisions=revisions || ?::jsonb,images=?::jsonb,caption=?,alt_text=?,image_prompts=?::jsonb,visual_snapshot=?::jsonb,visual_direction=?,status='review',review_note=?,correction_request=NULL,error_message=NULL,started_at=NULL WHERE id=?`,[
      JSON.stringify([snapshot]),JSON.stringify(target.images),target.caption??current.caption??"",target.alt_text??current.alt_text??"",JSON.stringify(target.image_prompts??current.image_prompts??[]),JSON.stringify(target.visual_snapshot??current.visual_snapshot??[]),target.visual_direction??current.visual_direction??"",`Versão ${input.version_index+1} restaurada. Confira as artes e aprove novamente.`,id
    ],db);
    return {ok:true};
  });
}
