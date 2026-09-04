import type { NextFunction, Request, Response } from "express";
import { assumeTenantRole, pool } from "../db/connection.js";
import { runWithDatabaseRequestContext } from "../db/requestContext.js";
import { AppError } from "../utils/errors.js";

export async function requireOrganization(req: Request, res: Response, next: NextFunction) {
  const organizationId = req.user?.organization.id;
  if (!organizationId) {
    next(new AppError("Selecione uma organizacao para continuar.", 403));
    return;
  }

  const client = await pool.connect();
  let finalized = false;
  const finalize = async (commit: boolean) => {
    if (finalized) return;
    finalized = true;
    try {
      await client.query(commit ? "COMMIT" : "ROLLBACK");
    } finally {
      client.release();
    }
  };

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [String(organizationId)]);
    await assumeTenantRole(client);
    res.once("finish", () => void finalize(res.statusCode < 400));
    res.once("close", () => void finalize(false));
    runWithDatabaseRequestContext({ client, organizationId, userId: req.user?.id }, next);
  } catch (error) {
    await finalize(false);
    next(error);
  }
}
