import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import { requireOrganizationRole } from "../middleware/organizationRoleMiddleware.js";
import { addPhoto, listSubjects, saveSubject, setPrimaryPhoto } from "../services/visualLibraryService.js";
import { z } from "zod";
import { contentAction, createEditorialBatch, editEditorialContent, getEditorialCalendar, listEditorialPlans, saveEditorialPlan } from "../services/editorialService.js";

export const contentRoutes = Router();
const upload = multer({ dest: config.uploadFilesDir, limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
const manager = requireOrganizationRole("owner", "admin");
contentRoutes.use("/social-media",manager);
contentRoutes.get("/social-media/plans",asyncHandler(async (_req,res) => {res.json(await listEditorialPlans());}));
contentRoutes.post("/social-media/plans",asyncHandler(async (req,res) => {res.status(201).json(await saveEditorialPlan(req.body));}));
contentRoutes.put("/social-media/plans/:id",asyncHandler(async (req,res) => {res.json(await saveEditorialPlan(req.body,Number(req.params.id)));}));
contentRoutes.get("/social-media/plans/:id/calendar",asyncHandler(async (req,res) => {res.json(await getEditorialCalendar(Number(req.params.id)));}));
contentRoutes.post("/social-media/plans/:id/batches",asyncHandler(async (req,res) => {
  const input = z.object({week_start:z.string().date().optional(),retry:z.boolean().default(false)}).safeParse(req.body);
  if(!input.success) throw new AppError("Semana inválida.",422);
  res.status(201).json(await createEditorialBatch(Number(req.params.id),input.data.week_start,undefined,input.data.retry));
}));
contentRoutes.post("/social-media/contents/:id/:action",asyncHandler(async (req,res) => {
  await contentAction(Number(req.params.id),String(req.params.action),String(req.body.note ?? ""));res.json({ok:true});
}));
contentRoutes.put("/social-media/contents/:id",asyncHandler(async (req,res) => {
  await editEditorialContent(Number(req.params.id),req.body);res.json({ok:true});
}));
contentRoutes.get("/clients/:clientId/visual-library", asyncHandler(async (req,res) => { res.json(await listSubjects(Number(req.params.clientId))); }));
contentRoutes.post("/clients/:clientId/visual-library", manager, asyncHandler(async (req,res) => { res.status(201).json(await saveSubject(Number(req.params.clientId), null, req.body)); }));
contentRoutes.put("/clients/:clientId/visual-library/:id", manager, asyncHandler(async (req,res) => { res.json(await saveSubject(Number(req.params.clientId), Number(req.params.id), req.body)); }));
contentRoutes.post("/clients/:clientId/visual-library/:id/photos", manager, upload.single("file"), asyncHandler(async (req,res) => {
  if (!req.file) throw new AppError("Envie uma imagem.", 422);
  await addPhoto(Number(req.params.clientId), Number(req.params.id), req.file.path, String(req.body.caption ?? "")); res.json({ok:true});
}));
contentRoutes.post("/clients/:clientId/visual-library/:id/photos/:photoId/primary", manager, asyncHandler(async (req,res) => {
  await setPrimaryPhoto(Number(req.params.clientId), Number(req.params.id), Number(req.params.photoId)); res.json({ok:true});
}));
