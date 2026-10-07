import bcrypt from "bcryptjs";
import { all, get, run, transaction } from "../db/connection.js";
import { seedOrganizationDefaults } from "../db/migrate.js";
import type { OrganizationRole } from "./authService.js";
import { AppError } from "../utils/errors.js";

export async function createOrganization(userId: number, name: string, accountType: "company" | "agency" = "company") {
  const normalizedName = name.trim();
  const baseSlug = slugify(normalizedName) || "empresa";
  const organization = await transaction(async (client) => {
    let slug = baseSlug;
    let suffix = 1;
    while (await get("SELECT id FROM organizations WHERE lower(slug) = lower(?)", [slug], client)) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }
    const result = await run(
      "INSERT INTO organizations (name, slug, status, account_type) VALUES (?, ?, 'active', ?)",
      [normalizedName, slug, accountType],
      client
    );
    const organizationId = Number(result.lastInsertRowid);
    await run(
      `INSERT INTO organization_members (organization_id, user_id, role, status, is_default)
       VALUES (?, ?, 'owner', 'active', FALSE)`,
      [organizationId, userId],
      client
    );
    return { id: organizationId, name: normalizedName, slug, accountType, role: "owner" as const };
  });

  await seedOrganizationDefaults(organization.id);
  return organization;
}

export async function listOrganizationMembers(organizationId: number) {
  return all(
    `SELECT u.id, u.name, u.email, m.role, m.status, m.created_at
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, u.name`,
    [organizationId]
  );
}

export async function updateAccountType(organizationId: number, type: "company" | "agency") {
  return transaction(async db => {
    const organization = await get("SELECT id FROM organizations WHERE id = ? FOR UPDATE", [organizationId], db);
    if (!organization) throw new AppError("Organização não encontrada.", 404);
    const count = await get<{ total: number }>("SELECT COUNT(*)::int total FROM clients", [], db);
    if (type === "company" && Number(count?.total) > 1) {
      throw new AppError("Esta conta já atende várias marcas. Mantenha agência/profissional para preservar todos os clientes.", 409);
    }
    await run("UPDATE organizations SET account_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [type, organizationId], db);
    return { accountType: type };
  });
}

export async function addOrganizationMember(
  organizationId: number,
  actorRole: OrganizationRole,
  input: { name: string; email: string; password?: string; role: Exclude<OrganizationRole, "owner"> }
) {
  if (!['owner', 'admin'].includes(actorRole)) throw new AppError("Sem permissao para gerenciar membros.", 403);
  const quota = await get<{ max_members: number; total: number }>(
    `SELECT o.max_members,
            (SELECT COUNT(*)::int FROM organization_members m WHERE m.organization_id = o.id AND m.status = 'active') total
       FROM organizations o WHERE o.id = ?`,
    [organizationId]
  );
  const email = input.email.trim().toLowerCase();
  let user = await get<{ id: number }>("SELECT id FROM users WHERE lower(email) = lower(?)", [email]);
  if (!user) {
    if (!input.password || input.password.length < 12) {
      throw new AppError("Para um novo usuario, informe uma senha inicial com pelo menos 12 caracteres.", 422);
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await run(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES (?, ?, ?, 'user', TRUE)`,
      [input.name.trim(), email, passwordHash]
    );
    user = { id: Number(result.lastInsertRowid) };
  }
  const existingMembership = await get<{ role: OrganizationRole }>(
    "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?",
    [organizationId, user.id]
  );
  if (existingMembership?.role === "owner") {
    throw new AppError("O papel do proprietario nao pode ser alterado por esta operacao.", 409);
  }
  if (!existingMembership && quota && Number(quota.total) >= Number(quota.max_members)) {
    throw new AppError(`O plano atual permite ate ${quota.max_members} membros.`, 409);
  }
  await run(
    `INSERT INTO organization_members (organization_id, user_id, role, status, is_default)
     VALUES (?, ?, ?, 'active', FALSE)
     ON CONFLICT (organization_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, status = 'active', updated_at = CURRENT_TIMESTAMP`,
    [organizationId, user.id, input.role]
  );
  return listOrganizationMembers(organizationId);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
