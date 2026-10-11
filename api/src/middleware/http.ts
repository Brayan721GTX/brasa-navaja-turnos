import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError, forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken, type AuthUser } from '../services/auth';
import type { Role } from '@prisma/client';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/** Permite usar async/await en handlers sin try/catch en cada uno. */
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Valida body/query/params con zod y devuelve el dato ya tipado. */
export const parse = <T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> => schema.parse(data);

export const requireAuth: RequestHandler = wrap(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized('Falta iniciar sesión');
  req.user = await verifyAccessToken(header.slice(7));
  next();
});

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Los profesionales solo ven/tocan lo suyo; el admin elige libremente. */
export const scopedProfessionalId = (user: AuthUser, requested?: string | null): string | undefined => {
  if (user.role === 'PROFESSIONAL') return user.professionalId ?? '__none__';
  return requested ?? undefined;
};

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Ruta inexistente'));

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Revisá los datos ingresados', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado. Probá de nuevo en un momento.' } });
};
