import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AppError } from "../utils/errors.js";

export function publishingSettings() {
  return { appId: process.env.META_APP_ID?.trim() || "", appSecret: process.env.META_APP_SECRET?.trim() || "",
    redirectUri: process.env.META_REDIRECT_URI?.trim() || "", version: process.env.META_GRAPH_VERSION?.trim() || "",
    key: process.env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim() || "", enabled: process.env.SOCIAL_PUBLISHING_ENABLED === "true" };
}
function encryptionKey() {
  const key = publishingSettings().key;
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new AppError("Configure SOCIAL_TOKEN_ENCRYPTION_KEY com 64 caracteres hexadecimais.",503);
  return Buffer.from(key,"hex");
}
export function sealSecret(value: string) {
  const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const data=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString("base64url");
}
export function openSecret(value: string) {
  try {
    const data=Buffer.from(value,"base64url");
    const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),data.subarray(0,12));
    decipher.setAuthTag(data.subarray(12,28));
    return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString("utf8");
  } catch { throw new AppError("Credencial ou autorização inválida. Reconecte a conta.",403); }
}
export function hashState(value:string) { return createHash("sha256").update(value).digest("hex"); }
export function isTimeZone(value:string) { try { new Intl.DateTimeFormat("en",{timeZone:value}).format();return true; } catch {return false;} }
export interface PublicationSnapshot {caption:string;alt_text:string;format:string;images:Array<{url:string;filename?:string;quality_issues?:string[]}>}
export function validatePublishable(content:PublicationSnapshot & {status:string},platform:string) {
  if(content.status!=="approved")throw new AppError("Aprove o conteúdo antes de agendar.",409);
  if(!["post","carousel"].includes(content.format))throw new AppError("Esta primeira versão publica posts e carrosséis no feed. Stories ainda não são suportados.",422);
  const count=content.format==="carousel"?3:1;
  if(content.images.length!==count || content.images.some(i=>!i?.url || i.quality_issues?.length))throw new AppError("Revise todas as artes antes de agendar.",422);
  if(!content.caption.trim())throw new AppError("O conteúdo precisa de uma legenda.",422);
  if(content.caption.length>(platform==="instagram"?2200:63206))throw new AppError("A legenda excede o limite da rede selecionada (Instagram: 2.200 caracteres).",422);
}
