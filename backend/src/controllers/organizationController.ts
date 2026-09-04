import type { Request, Response } from "express";
import { z } from "zod";
import { addOrganizationMember, createOrganization, listOrganizationMembers } from "../services/organizationService.js";
import { AppError } from "../utils/errors.js";

export async function createOrganizationController(req: Request, res: Response) {
  if (!req.user) throw new AppError("Autenticacao necessaria.", 401);
  const parsed = z.object({ name: z.string().trim().min(2).max(120) }).safeParse(req.body);
  if (!parsed.success) throw new AppError("Informe o nome da empresa.", 422);
  res.status(201).json(await createOrganization(req.user.id, parsed.data.name));
}

export async function listOrganizationMembersController(req: Request, res: Response) {
  if (!req.user) throw new AppError("Autenticacao necessaria.", 401);
  res.json(await listOrganizationMembers(req.user.organization.id));
}

export async function addOrganizationMemberController(req: Request, res: Response) {
  if (!req.user) throw new AppError("Autenticacao necessaria.", 401);
  const parsed = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    password: z.string().min(12).max(256).optional(),
    role: z.enum(["admin", "member"])
  }).safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? "Revise os dados do membro.", 422);
  res.status(201).json(await addOrganizationMember(
    req.user.organization.id,
    req.user.organizationRole,
    parsed.data
  ));
}
