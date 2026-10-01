import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { requireOrganizationRole } from "../middleware/organizationRoleMiddleware.js";

test("somente owner e admin passam por uma rota de gestao", () => {
  const guard = requireOrganizationRole("owner", "admin");
  for (const role of ["owner", "admin", "member"] as const) {
    let result: unknown = "not-called";
    const req = { user: { organizationRole: role } } as Request;
    guard(req, {} as Response, ((error?: unknown) => { result = error; }) as NextFunction);
    if (role === "member") {
      assert.equal((result as { statusCode?: number }).statusCode, 403);
    } else {
      assert.equal(result, undefined);
    }
  }
});

test("rota de gestao rejeita requisicao sem papel", () => {
  let result: unknown;
  requireOrganizationRole("owner", "admin")({} as Request, {} as Response, ((error?: unknown) => { result = error; }) as NextFunction);
  assert.equal((result as { statusCode?: number }).statusCode, 403);
});
