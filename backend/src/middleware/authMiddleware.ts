import type { NextFunction, Request, Response } from "express";
import { authenticateToken } from "../services/authService.js";
import { AppError } from "../utils/errors.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    next(new AppError("Autenticacao necessaria.", 401));
    return;
  }

  void authenticateToken(match[1])
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
}
