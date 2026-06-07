import type { Request, Response } from "express";
import { z } from "zod";
import {
  activatePlan,
  cancelPending,
  createPlan,
  generateNow,
  getPlan,
  listGenerationLogs,
  listPlans,
  listQueue,
  pausePlan,
  reprocessQueueItem,
  resumePlan,
  retryFailures,
  updatePlan
} from "../services/campaignPlannerService.js";
import { AppError } from "../utils/errors.js";

const planSchema = z.object({
  name: z.string().min(2),
  theme: z.string().min(2),
  strategic_description: z.string().optional(),
  objective: z.string().min(2),
  start_date: z.string().min(10),
  end_date: z.string().min(10),
  recurrence_type: z.enum(["once", "daily", "weekly", "biweekly", "monthly"]),
  recurrence_days: z.array(z.coerce.number()).optional(),
  preferred_time: z.string().optional(),
  ads_per_client: z.coerce.number().int().positive(),
  ad_format: z.enum(["1:1", "4:5", "9:16", "16:9"]),
  max_ads_per_day: z.coerce.number().int().positive(),
  max_ads_per_hour: z.coerce.number().int().positive(),
  min_interval_minutes: z.coerce.number().int().positive(),
  approval_mode: z.enum(["draft", "waiting_review", "approved"]),
  variation_mode: z.string().min(2),
  status: z.enum(["draft", "active", "paused", "completed"]),
  clients: z.array(z.object({ client_id: z.coerce.number().int().positive(), ads_quantity: z.coerce.number().int().positive().optional() })).min(1)
});

export async function listPlansController(_req: Request, res: Response) {
  res.json(await listPlans());
}

export async function getPlanController(req: Request, res: Response) {
  const plan = await getPlan(Number(req.params.id));
  if (!plan) throw new AppError("Planejamento nao encontrado.", 404);
  res.json(plan);
}

export async function createPlanController(req: Request, res: Response) {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? "Revise o planejamento.", 422);
  res.status(201).json(await createPlan(parsed.data));
}

export async function updatePlanController(req: Request, res: Response) {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? "Revise o planejamento.", 422);
  res.json(await updatePlan(Number(req.params.id), parsed.data));
}

export async function planActionController(req: Request, res: Response) {
  const id = Number(req.params.id);
  const action = req.params.action;
  if (action === "activate") {
    res.json(await activatePlan(id));
    return;
  }
  if (action === "pause") {
    res.json(await pausePlan(id));
    return;
  }
  if (action === "resume") {
    res.json(await resumePlan(id));
    return;
  }
  if (action === "cancel-pending") {
    res.json(await cancelPending(id));
    return;
  }
  if (action === "retry-failures") {
    res.json(await retryFailures(id));
    return;
  }
  if (action === "generate-now") {
    res.json(await generateNow(id));
    return;
  }
  throw new AppError("Acao invalida.", 404);
}

export async function listQueueController(req: Request, res: Response) {
  res.json(await listQueue(req.query.plan_id ? { planId: Number(req.query.plan_id) } : undefined));
}

export async function reprocessQueueItemController(req: Request, res: Response) {
  res.json(await reprocessQueueItem(Number(req.params.id)));
}

export async function listPlannerLogsController(req: Request, res: Response) {
  res.json(await listGenerationLogs(req.query.plan_id ? { planId: Number(req.query.plan_id) } : undefined));
}
