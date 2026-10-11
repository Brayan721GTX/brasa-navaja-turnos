import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, forbidden } from '../lib/errors';
import { parse, requireAuth, wrap } from '../middleware/http';
import { hashPassword, login, logout, publicUser, refresh } from '../services/auth';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Demasiados intentos. Probá de nuevo en unos minutos.' } },
});

authRouter.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    res.json(await login(email, password));
  }),
);

authRouter.post(
  '/refresh',
  wrap(async (req, res) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
    res.json(await refresh(refreshToken));
  }),
);

authRouter.post(
  '/logout',
  wrap(async (req, res) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
    await logout(refreshToken);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json(publicUser(user));
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  wrap(async (req, res) => {
    if (req.user!.isDemo) throw forbidden('Las cuentas de demo no pueden cambiar su contraseña.');
    const body = parse(z.object({ currentPassword: z.string(), newPassword: z.string().min(8, 'Mínimo 8 caracteres').max(100) }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw badRequest('La contraseña actual no es correcta');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    res.status(204).end();
  }),
);
