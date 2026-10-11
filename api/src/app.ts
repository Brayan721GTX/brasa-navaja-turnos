import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { timingSafeEqual } from 'node:crypto';
import { config } from './lib/config';
import { prisma } from './lib/prisma';
import { AppError, unauthorized } from './lib/errors';
import { errorHandler, notFoundHandler, wrap } from './middleware/http';
import { publicRouter } from './routes/public';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { openApiSpec } from './openapi';
import { resetDemoData } from './seed/demo';

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: (origin, cb) => {
        // Sin origin = herramientas como curl o una app móvil nativa
        if (!origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) return cb(null, true);
        cb(new AppError(403, 'CORS', 'Origen no permitido'));
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  if (!config.isProd) app.use(morgan('dev'));

  app.get('/', (_req, res) => res.json({ name: 'Turnos Online API', docs: '/api/docs', version: 'v1' }));
  app.get('/api/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Turnos Online · API' }));

  const v1 = express.Router();
  v1.use('/public', publicRouter);
  v1.use('/auth', authRouter);
  v1.use('/admin', adminRouter);

  // Reset de la demo: lo llama un cron externo (GitHub Actions) y también sirve para "despertar" el servicio
  v1.post(
    '/internal/demo-reset',
    wrap(async (req, res) => {
      const secret = String(req.headers['x-cron-secret'] ?? '');
      if (!config.demoMode || !config.cronSecret || !safeEqual(secret, config.cronSecret)) throw unauthorized('Secreto inválido');
      res.json({ ok: true, ...(await resetDemoData(prisma)) });
    }),
  );

  app.use('/api/v1', v1);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
