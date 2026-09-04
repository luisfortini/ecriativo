import type { NextFunction, Request, Response } from "express";
import { authenticateToken } from "../services/authService.js";
import { AppError } from "../utils/errors.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const cookieToken = readCookie(req.header("cookie"), "ecriativo_session");
  const token = match?.[1] ?? cookieToken;

  if (!token) {
    next(new AppError("Autenticacao necessaria.", 401));
    return;
  }

  void authenticateToken(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}
