import { z } from "zod";
import { all, run, transaction } from "../db/connection.js";
import { AppError } from "../utils/errors.js";
import { assertContentNotScheduled } from "./socialPublishingService.js";

export interface CorrectionRequest {note:string;indexes:number[];completed:number[];rewrite_text?:boolean;text_updated?:boolean}
const inputSchema=z.object({
  note:z.string().trim().min(3,"Descreva a correção desejada.").max(2000),
  rewrite_text:z.boolean().default(false),
  targets:z.array(z.object({content_id:z.coerce.number().int().positive(),image_indexes:z.array(z.number().int().min(0).max(2)).min(1).max(3)})).min(1).max(100)
}).refine(v=>new Set(v.targets.map(t=>t.content_id)).size===v.targets.length,"Selecione cada conteúdo uma única vez.");
export async function requestEditorialCorrections(planId:number|undefined,raw:unknown) {
  const parsed=inputSchema.safeParse(raw);
  if(!parsed.success)throw new AppError(parsed.error.issues[0].message,422);
  const {note,targets,rewrite_text}=parsed.data;
  return transaction(async db=>{
    const items=await all<{id:number;batch_id:number;format:string;status:string;active:boolean;weekly_image_limit:number;image_calls:number}>(`
      SELECT c.id,c.batch_id,c.format,c.status,p.active,p.weekly_image_limit,b.image_calls
      FROM social_contents c JOIN editorial_batches b ON b.id=c.batch_id JOIN editorial_plans p ON p.id=b.plan_id
      WHERE c.id=ANY(?::bigint[]) AND (?::bigint IS NULL OR p.id=?) ORDER BY c.id FOR UPDATE OF c,p,b
    `,[targets.map(t=>t.content_id),planId??null,planId??null],db);
    if(items.length!==targets.length)throw new AppError("Um dos conteúdos não pertence ao plano selecionado.",404);
    const calls=new Map<number,number>();
    for(const item of items) {
      await assertContentNotScheduled(Number(item.id));
      if(!item.active)throw new AppError("Ative o plano antes de solicitar correções.",409);
      if(!["review","rejected","approved","failed","cancelled"].includes(item.status))throw new AppError("Aguarde os conteúdos em produção ou na fila antes de corrigir.",409);
      const target=targets.find(t=>t.content_id===Number(item.id))!;
      if(target.image_indexes.some(i=>i>=(item.format==="carousel"?3:1)))throw new AppError("A seleção contém uma arte inexistente.",422);
      if(rewrite_text && new Set(target.image_indexes).size !== (item.format==="carousel"?3:1))throw new AppError("Para reescrever textos ou mudar o idioma, selecione todas as artes de cada conteúdo.",422);
      const count=(calls.get(Number(item.batch_id))||0)+new Set(target.image_indexes).size;
      calls.set(Number(item.batch_id),count);
      if(item.image_calls+count>item.weekly_image_limit)throw new AppError("O limite de imagens do plano não comporta estas correções. Aumente o limite no plano e tente novamente.",409);
    }
    for(const item of items) {
      const indexes=[...new Set(targets.find(t=>t.content_id===Number(item.id))!.image_indexes)].sort((a,b)=>a-b);
      await run(`UPDATE social_contents SET
        revisions=revisions || jsonb_build_array(jsonb_build_object('caption',caption,'alt_text',alt_text,'images',images,'image_prompts',image_prompts,'visual_snapshot',visual_snapshot,'visual_direction',visual_direction,'review_note',review_note,'status',status,'at',CURRENT_TIMESTAMP,'correction',?::jsonb)),
        correction_request=?::jsonb,status='pending',review_note=?,error_message=NULL WHERE id=?
      `,[JSON.stringify({note,indexes,rewrite_text}),JSON.stringify({note,indexes,completed:[],rewrite_text}),note,item.id],db);
    }
    return {queued:items.length,images:targets.reduce((total,t)=>total+new Set(t.image_indexes).size,0)};
  });
}
