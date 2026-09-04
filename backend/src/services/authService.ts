import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { all, get } from "../db/connection.js";
import { AppError } from "../utils/errors.js";

export type UserRole = "admin" | "user";
export type OrganizationRole = "owner" | "admin" | "member";

export interface AuthOrganization {
  id: number;
  name: string;
  slug: string;
  role: OrganizationRole;
  planCode: string;
  billingStatus: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  organizationRole: OrganizationRole;
  organization: AuthOrganization;
  organizations: AuthOrganization[];
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  password_hash: string;
  active: boolean;
}

const invalidCredentialsMessage = "E-mail ou senha invalidos.";
const dummyPasswordHash = "$2b$12$/VyDRQNC9aXmRpEiNSx1DOGEWGu6CcG3KZzIlZaGM5g0QRXg21SCu";

export async function login(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await get<UserRow>(
    `SELECT id, name, email, password_hash, role, active
       FROM users
       WHERE lower(email) = lower(?)
       LIMIT 1`,
    [normalizedEmail]
  );

  const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? dummyPasswordHash);
  if (!user || !passwordMatches || !user.active) {
    throw new AppError(invalidCredentialsMessage, 401);
  }

  const publicUser = await loadAuthUser(user);
  const token = signToken(publicUser);

  return {
    token,
    expiresIn: config.jwtExpiresInSeconds,
    user: publicUser
  };
}

export async function authenticateToken(token: string): Promise<AuthUser> {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "e-criativo",
      audience: "e-criativo-web"
    });
  } catch {
    throw new AppError("Sessao invalida ou expirada.", 401);
  }

  const userId = typeof payload === "string" ? NaN : Number(payload.sub);
  const organizationId = typeof payload === "string" ? NaN : Number(payload.organizationId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new AppError("Sessao invalida ou expirada.", 401);
  }

  const user = await get<UserRow>(
    `SELECT id, name, email, password_hash, role, active
       FROM users
       WHERE id = ?
       LIMIT 1`,
    [userId]
  );

  if (!user?.active) throw new AppError("Sessao invalida ou expirada.", 401);
  return loadAuthUser(user, Number.isSafeInteger(organizationId) ? organizationId : undefined);
}

export async function switchOrganization(userId: number, organizationId: number) {
  const user = await get<UserRow>(
    "SELECT id, name, email, password_hash, role, active FROM users WHERE id = ? AND active = TRUE",
    [userId]
  );
  if (!user) throw new AppError("Usuario nao encontrado.", 404);
  const publicUser = await loadAuthUser(user, organizationId);
  return { token: signToken(publicUser), expiresIn: config.jwtExpiresInSeconds, user: publicUser };
}

async function loadAuthUser(user: UserRow, preferredOrganizationId?: number): Promise<AuthUser> {
  const memberships = await all<{ id: number; name: string; slug: string; role: OrganizationRole; is_default: boolean; plan_code: string; billing_status: string }>(
    `SELECT o.id, o.name, o.slug, o.plan_code, o.billing_status, m.role, m.is_default
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active'
       ORDER BY m.is_default DESC, o.name ASC`,
    [user.id]
  );
  const requestedOrganization = preferredOrganizationId === undefined
    ? undefined
    : memberships.find((item) => Number(item.id) === preferredOrganizationId);
  if (preferredOrganizationId !== undefined && !requestedOrganization) {
    throw new AppError("Sem acesso a organizacao selecionada.", 403);
  }
  const organization = requestedOrganization ?? memberships[0];
  if (!organization) throw new AppError("Usuario sem organizacao ativa.", 403);
  const organizations = memberships.map(({ id, name, slug, role, plan_code, billing_status }) => ({
    id: Number(id), name, slug, role, planCode: plan_code, billingStatus: billing_status
  }));
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    organizationRole: organization.role,
    organization: {
      id: Number(organization.id), name: organization.name, slug: organization.slug, role: organization.role,
      planCode: organization.plan_code, billingStatus: organization.billing_status
    },
    organizations
  };
}

function signToken(user: AuthUser) {
  return jwt.sign(
    { role: user.role, organizationId: user.organization.id, organizationRole: user.organizationRole },
    config.jwtSecret,
    {
      algorithm: "HS256",
      subject: String(user.id),
      issuer: "e-criativo",
      audience: "e-criativo-web",
      expiresIn: config.jwtExpiresInSeconds
    }
  );
}
