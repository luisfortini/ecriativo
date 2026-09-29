import type { NextFunction, Request, Response } from "express";
import type { OrganizationRole } from "../services/authService.js";
import { AppError } from "../utils/errors.js";

export function requireOrganizationRole(...allowedRoles: OrganizationRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.organizationRole;
    if (!role || !allowedRoles.includes(role)) {
      next(new AppError("Sem permissao para esta acao na empresa.", 403));
      return;
    }
    next();
  };
}
