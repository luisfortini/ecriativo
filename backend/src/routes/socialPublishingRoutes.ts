import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import { requireOrganizationRole } from "../middleware/organizationRoleMiddleware.js";
import { publishingOverview,setSocialAccount,scheduleSocialPublication,cancelSocialPublication,readPublicationMedia,reconcileSocialPublication } from "../services/socialPublishingService.js";
import { startMetaConnection,finishMetaConnection } from "../services/socialOAuthService.js";

export const socialPublishingRoutes=Router();
socialPublishingRoutes.use("/social-media",requireOrganizationRole("owner","admin"));
function id(value:unknown) {const parsed=z.coerce.number().int().positive().safeParse(value);if(!parsed.success)throw new AppError("Identificador inválido.",422);return parsed.data;}
socialPublishingRoutes.get("/social-media/clients/:id/publishing",asyncHandler(async(req,res)=>{res.json(await publishingOverview(id(req.params.id)));}));
socialPublishingRoutes.post("/social-media/clients/:id/meta-connect",asyncHandler(async(req,res)=>{res.json(await startMetaConnection(id(req.params.id)));}));
socialPublishingRoutes.patch("/social-media/accounts/:id",asyncHandler(async(req,res)=>{
  const input=z.object({active:z.boolean()}).safeParse(req.body);if(!input.success)throw new AppError("Informe se a conta está ativa.",422);
  await setSocialAccount(id(req.params.id),input.data.active);res.json({ok:true});
}));
socialPublishingRoutes.post("/social-media/contents/:id/schedule",asyncHandler(async(req,res)=>{res.status(201).json(await scheduleSocialPublication(id(req.params.id),req.body));}));
socialPublishingRoutes.post("/social-media/publications/:id/cancel",asyncHandler(async(req,res)=>{await cancelSocialPublication(id(req.params.id));res.json({ok:true});}));
socialPublishingRoutes.post("/social-media/publications/:id/reconcile",asyncHandler(async(req,res)=>{await reconcileSocialPublication(id(req.params.id),req.body);res.json({ok:true});}));

// Narrow unauthenticated endpoints: OAuth is single-use encrypted state; media
// links authorize only a particular publication image while it is publishing.
export const socialPublishingPublicRoutes=Router();
socialPublishingPublicRoutes.get("/social-publishing/meta/callback",async(req,res)=>{
  res.set({"Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'","Referrer-Policy":"no-referrer"});
  try {
    const parsed=z.object({state:z.string().min(20).max(4000),code:z.string().min(1).max(4000)}).safeParse(req.query);
    if(!parsed.success)throw new AppError("Conexão cancelada ou autorização inválida. Volte ao Social Media para tentar novamente.",422);
    await finishMetaConnection(parsed.data.state,parsed.data.code);
    res.type("text/plain").send("Contas conectadas, ainda desativadas. Volte ao Social Media, atualize as conexões e ative somente as contas deste cliente. Pode fechar esta aba.");
  }catch(error){res.status(error instanceof AppError?error.statusCode:500).type("text/plain").send(error instanceof AppError?error.message:"Não foi possível conectar. Volte ao Social Media e tente novamente.");}
});
socialPublishingPublicRoutes.get("/social-publishing/media/:token.jpg",asyncHandler(async(req,res)=>{
  const token=z.string().min(20).max(2000).safeParse(req.params.token);if(!token.success)throw new AppError("Link inválido.",403);
  res.set({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}).type("image/jpeg").send(await readPublicationMedia(token.data));
}));
