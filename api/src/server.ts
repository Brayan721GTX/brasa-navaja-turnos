import cron from 'node-cron';
import { createApp } from './app';
import { config } from './lib/config';
import { prisma } from './lib/prisma';
import { resetDemoData } from './seed/demo';
import { DEFAULT_TZ } from './lib/time';

const app = createApp();

app.listen(config.port, () => {
  console.log(`API escuchando en el puerto ${config.port} (demo: ${config.demoMode})`);
});

if (config.demoMode) {
  // Respaldo del cron externo: si el servicio estaba dormido a las 03:00 y se despierta después,
  // al arrancar verifica si pasó más de un día desde el último reset.
  const maybeReset = async () => {
    const state = await prisma.systemState.findUnique({ where: { key: 'lastDemoReset' } }).catch(() => null);
    const last = state ? new Date(state.value).getTime() : 0;
    if (Date.now() - last > 26 * 3_600_000) {
      console.log('Reseteando datos de demo...');
      await resetDemoData(prisma);
    }
  };
  maybeReset().catch((e) => console.error('Fallo el chequeo de reset al iniciar:', e));
  cron.schedule('0 3 * * *', () => resetDemoData(prisma).catch((e) => console.error(e)), { timezone: DEFAULT_TZ });
}
