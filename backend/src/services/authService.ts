import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { get } from "../db/connection.js";
import { AppError } from "../utils/errors.js";

export type UserRole = "admin" | "user";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

interface UserRow extends AuthUser {
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

  const publicUser = toAuthUser(user);
  const token = jwt.sign(
    { role: publicUser.role },
    config.jwtSecret,
    {
      algorithm: "HS256",
      subject: String(publicUser.id),
      issuer: "e-criativo",
      audience: "e-criativo-web",
      expiresIn: config.jwtExpiresInSeconds
    }
  );

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
  return toAuthUser(user);
}

function toAuthUser(user: UserRow): AuthUser {
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    role: user.role
  };
}
