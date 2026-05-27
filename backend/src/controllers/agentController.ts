import type { Request, Response } from "express";
import { z } from "zod";
import {
  compareAgentVersion,
  createAgent,
  duplicateAgent,
  getAgent,
  getAgentLogs,
  listAgents,
  restoreAgentVersion,
  testAgent,
  updateAgent
} from "../services/agentService.js";
import { getClient, listClientAssets } from "../services/clientService.js";
import { normalizeBriefing } from "../services/briefingNormalizerService.js";
import { AppError } from "../utils/errors.js";
import type { ClientProfile, NewCampaignInput } from "../types.js";

const agentSchema = z.object({
  name: z.string().min(2),
  key: z.string().min(2),
  description: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  model: z.string().min(2),
  temperature: z.coerce.number().min(0).max(2).optional().nullable(),
  max_tokens: z.coerce.number().int().positive().optional().nullable(),
  system_prompt: z.string().min(5),
  prompt_template: z.string().min(5),
  output_schema_json: z.string().min(2),
  is_active: z.union([z.boolean(), z.coerce.number()]).transform(Boolean),
  execution_order: z.coerce.number().int(),
  change_notes: z.string().optional()
});

export function listAgentsController(_req: Request, res: Response) {
  res.json(listAgents());
}

export function getAgentController(req: Request, res: Response) {
  const agent = getAgent(Number(req.params.id));
  if (!agent) throw new AppError("Agente nao encontrado.", 404);
  res.json(agent);
}

export function createAgentController(req: Request, res: Response) {
  const parsed = agentSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? "Revise o agente.", 422);
  res.status(201).json(createAgent(normalizeAgentPayload(parsed.data)));
}

export function updateAgentController(req: Request, res: Response) {
  const parsed = agentSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? "Revise o agente.", 422);
  res.json(updateAgent(Number(req.params.id), normalizeAgentPayload(parsed.data)));
}

export function duplicateAgentController(req: Request, res: Response) {
  res.status(201).json(duplicateAgent(Number(req.params.id)));
}

export function restoreAgentVersionController(req: Request, res: Response) {
  res.json(restoreAgentVersion(Number(req.params.id), Number(req.params.versionId)));
}

export function compareAgentVersionController(req: Request, res: Response) {
  res.json(compareAgentVersion(Number(req.params.id), Number(req.params.versionId)));
}

export function getAgentLogsController(req: Request, res: Response) {
  res.json(getAgentLogs(Number(req.params.id), 100));
}

export async function testAgentController(req: Request, res: Response) {
  const parsed = z
    .object({
      client_id: z.coerce.number().int().positive().optional().nullable(),
      briefing: z.string().min(3),
      context_json: z.string().optional()
    })
    .safeParse(req.body);

  if (!parsed.success) throw new AppError("Informe briefing de teste.", 422);

  let context: unknown = { free_briefing: parsed.data.briefing };
  if (parsed.data.context_json?.trim()) {
    context = JSON.parse(parsed.data.context_json);
  } else if (parsed.data.client_id) {
    const client = getClient(parsed.data.client_id);
    if (!client) throw new AppError("Cliente nao encontrado.", 404);
    const input: NewCampaignInput = {
      client_id: parsed.data.client_id,
      free_briefing: parsed.data.briefing,
      formato: "1:1"
    };
    context = normalizeBriefing(input, client as ClientProfile, listClientAssets(parsed.data.client_id));
  }

  res.json(await testAgent(Number(req.params.id), context, parsed.data.client_id ?? null));
}

function normalizeAgentPayload(payload: z.infer<typeof agentSchema>) {
  return {
    ...payload,
    description: payload.description ?? null,
    role: payload.role ?? null,
    temperature: payload.temperature ?? null,
    max_tokens: payload.max_tokens ?? null,
    is_active: payload.is_active ? 1 : 0
  };
}
