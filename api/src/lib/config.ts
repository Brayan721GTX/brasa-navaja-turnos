import 'dotenv/config';

const required = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Falta la variable de entorno ${name}`);
  return v;
};

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-secret-no-usar-en-produccion'),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  webUrl: (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  demoMode: process.env.DEMO_MODE === 'true',
  cronSecret: process.env.CRON_SECRET ?? '',
  accessTokenTtlSec: 60 * 60,
  refreshTokenTtlDays: 30,
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'Turnos <turnos@example.com>',
  },
};
