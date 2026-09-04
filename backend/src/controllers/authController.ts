import type { Request, Response } from "express";
import { z } from "zod";
import { login, switchOrganization } from "../services/authService.js";
import { AppError } from "../utils/errors.js";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256)
});

export async function loginController(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("E-mail ou senha invalidos.", 401);

  res.setHeader("Cache-Control", "no-store");
  const session = await login(parsed.data.email, parsed.data.password);
  setSessionCookie(res, session.token, session.expiresIn);
  res.json(session);
}

export async function meController(req: Request, res: Response) {
  if (!req.user) throw new AppError("Autenticacao necessaria.", 401);
  res.setHeader("Cache-Control", "no-store");
  res.json({ user: req.user });
}

export async function logoutController(_req: Request, res: Response) {
  res.clearCookie("ecriativo_session", sessionCookieOptions());
  res.status(204).end();
}

export async function switchOrganizationController(req: Request, res: Response) {
  if (!req.user) throw new AppError("Autenticacao necessaria.", 401);
  const parsed = z.object({ organization_id: z.coerce.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) throw new AppError("Organizacao invalida.", 422);
  res.setHeader("Cache-Control", "no-store");
  const session = await switchOrganization(req.user.id, parsed.data.organization_id);
  setSessionCookie(res, session.token, session.expiresIn);
  res.json(session);
}

function setSessionCookie(res: Response, token: string, expiresIn: number) {
  res.cookie("ecriativo_session", token, { ...sessionCookieOptions(), maxAge: expiresIn * 1000 });
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" as const : "lax" as const,
    path: "/"
  };
}
