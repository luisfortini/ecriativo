import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { all, get, run, runWithOrganizationContext } from "../db/connection.js";
import { AppError } from "../utils/errors.js";

export type MediaKind = "generated" | "uploads";
const backendRoot=fileURLToPath(new URL("../../",import.meta.url));
const types:Record<string,string>={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml",".pdf":"application/pdf"};
export function mediaFilename(value:string) {
  const pathname=/^https?:\/\//i.test(value)?new URL(value).pathname:value;
  const filename=decodeURIComponent(pathname.split(/[\\/]/).pop() || "");
  if(!filename || filename.includes("..") || /[\\/\u0000]/.test(filename))throw new AppError("Arquivo inválido.",400);
  return filename;
}
function directories(kind:MediaKind) {
  return [...new Set([kind==="generated"?config.generatedFilesDir:config.uploadFilesDir,path.join(backendRoot,kind),path.resolve(kind),path.resolve("backend",kind)])];
}
export async function persistMedia(kind:MediaKind, filename:string, data:Buffer) {
  filename=mediaFilename(filename);
  if(data.length>30*1024*1024)throw new AppError("Arquivo excede 30 MB.",422);
  await run("INSERT INTO media_files(kind,filename,content_type,data) VALUES(?,?,?,?) ON CONFLICT(organization_id,kind,filename) DO NOTHING",[kind,filename,types[path.extname(filename).toLowerCase()]||"application/octet-stream",data]);
}
export async function persistMediaPath(kind:MediaKind, filePath:string) {
  await persistMedia(kind,mediaFilename(filePath),await fs.readFile(filePath));
}
export async function readMedia(kind:MediaKind, filename:string) {
  filename=mediaFilename(filename);
  const stored=await get<{data:Buffer;content_type:string}>("SELECT data,content_type FROM media_files WHERE kind=? AND filename=?",[kind,filename]);
  if(stored)return stored;
  for(const directory of directories(kind)) {
    const filePath=path.resolve(directory,filename);
    if(path.dirname(filePath)!==path.resolve(directory))continue;
    try {
      const data=await fs.readFile(filePath);
      await persistMedia(kind,filename,data);
      return {data,content_type:types[path.extname(filename).toLowerCase()]||"application/octet-stream"};
    } catch(error) {
      if((error as NodeJS.ErrnoException).code==="ENOENT")continue;
      throw error;
    }
  }
  throw new AppError("Arquivo não encontrado no armazenamento. Restaure-o de um backup anterior.",404);
}
export async function ensureMediaPath(kind:MediaKind,filename:string) {
  const target=path.join(directories(kind)[0],mediaFilename(filename));
  try {await fs.access(target);return target;}catch {}
  const stored=await readMedia(kind,filename);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,stored.data);
  return target;
}
export async function backfillPersistentMedia() {
  const organizations=await all<{id:number}>("SELECT id FROM organizations ORDER BY id");
  const totals={saved:0,missing:0};
  for(const org of organizations)await runWithOrganizationContext(Number(org.id),async()=>{
    const files=await all<{kind:MediaKind;value:string}>(`
      SELECT 'uploads' kind,file_url value FROM client_assets
      UNION SELECT 'uploads',filename FROM visual_photos
      UNION SELECT 'uploads',reference_file_path FROM campaigns WHERE reference_file_path IS NOT NULL
      UNION SELECT 'generated',image_url FROM campaigns WHERE image_url IS NOT NULL
      UNION SELECT 'generated',final_image_url FROM campaigns WHERE final_image_url IS NOT NULL
      UNION SELECT 'generated',image_path FROM campaigns WHERE image_path IS NOT NULL
      UNION SELECT 'generated',COALESCE(NULLIF(i->>'filename',''),i->>'url') FROM social_contents s CROSS JOIN LATERAL jsonb_array_elements(s.images) i
      UNION SELECT 'generated',COALESCE(NULLIF(i->>'filename',''),i->>'url') FROM social_contents s CROSS JOIN LATERAL jsonb_array_elements(s.revisions) r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r->'images','[]'::jsonb)) i
    `);
    const seen=new Set<string>();
    for(const file of files) {
      if(!file.value)continue;
      const name=mediaFilename(file.value),key=file.kind+":"+name;
      if(seen.has(key))continue;seen.add(key);
      if(await get("SELECT id FROM media_files WHERE kind=? AND filename=?",[file.kind,name]))continue;
      try {await readMedia(file.kind,name);totals.saved++;}
      catch(error) {if(error instanceof AppError && error.statusCode===404)totals.missing++;else throw error;}
    }
  });
  return totals;
}
