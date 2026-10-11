/**
 * Postgres local para desarrollo sin instalar nada (ni Docker): `npm run db:local`.
 * Deja corriendo una base en el puerto 54330 con datos persistentes en api/.localdb
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const dir = join(__dirname, '..', '.localdb');
const url = 'postgresql://dev:dev@localhost:54330/turnos_dev';

async function main() {
  const fresh = !existsSync(join(dir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'dev', password: 'dev', port: 54330, persistent: true });
  if (fresh) {
    await pg.initialise();
  }
  await pg.start();
  if (fresh) await pg.createDatabase('turnos_dev');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
  console.log(`\nBase local lista en ${url}\nUsala en api/.env como DATABASE_URL y DIRECT_URL. Ctrl+C para detenerla.`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
