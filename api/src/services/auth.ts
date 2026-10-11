import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Role, User } from '@prisma/client';
import { config } from '../lib/config';
import { prisma } from '../lib/prisma';
import { unauthorized } from '../lib/errors';

export interface AuthUser {
  id: string;
  role: Role;
  professionalId: string | null;
  isDemo: boolean;
  name: string;
  email: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);

export const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  professionalId: u.professionalId,
  isDemo: u.isDemo,
});

export function signAccessToken(u: User): string {
  return jwt.sign({ sub: u.id, role: u.role, pid: u.professionalId }, config.jwtSecret, { expiresIn: config.accessTokenTtlSec });
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: { tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000) },
  });
  return token;
}

async function session(u: User) {
  return {
    accessToken: signAccessToken(u),
    refreshToken: await issueRefreshToken(u.id),
    expiresIn: config.accessTokenTtlSec,
    user: publicUser(u),
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Mismo mensaje para "no existe" y "clave incorrecta": no revelamos qué cuentas existen
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    throw unauthorized('Email o contraseña incorrectos');
  }
  return session(user);
}

/** Rotación: cada refresh token sirve una sola vez. */
export async function refresh(token: string) {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!row || row.expiresAt < new Date() || !row.user.active) throw unauthorized('Sesión vencida, ingresá de nuevo');
  await prisma.refreshToken.delete({ where: { id: row.id } });
  return session(row.user);
}

export async function logout(token: string) {
  await prisma.refreshToken.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function verifyAccessToken(token: string): Promise<AuthUser> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw unauthorized('Sesión inválida o vencida');
  }
  const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
  if (!user || !user.active) throw unauthorized('Usuario inactivo');
  return {
    id: user.id,
    role: user.role,
    professionalId: user.professionalId,
    isDemo: user.isDemo,
    name: user.name,
    email: user.email,
  };
}
