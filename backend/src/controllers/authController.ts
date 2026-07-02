import type { Request, Response } from "express";
import { z } from "zod";
import { login } from "../services/authService.js";
import { AppError } from "../utils/errors.js";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256)
});

export async function loginController(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("E-mail ou senha invalidos.", 401);

  res.setHeader("Cache-Control", "no-store");
  res.json(await login(parsed.data.email, parsed.data.password));
}

export async function meController(req: Request, res: Response) {
  if (!req.user) throw new AppError("Autenticacao necessaria.", 401);
  res.setHeader("Cache-Control", "no-store");
  res.json({ user: req.user });
}

export async function logoutController(_req: Request, res: Response) {
  res.status(204).end();
}
