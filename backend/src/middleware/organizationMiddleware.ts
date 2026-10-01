import type { NextFunction, Request, Response } from "express";
import { runWithDatabaseRequestContext } from "../db/requestContext.js";
import { AppError } from "../utils/errors.js";

export function requireOrganization(req: Request, _res: Response, next: NextFunction) {
  const organizationId = req.user?.organization.id;
  if (!organizationId) {
    next(new AppError("Selecione uma organizacao para continuar.", 403));
    return;
  }

  runWithDatabaseRequestContext({ organizationId, userId: req.user?.id }, next);
}
