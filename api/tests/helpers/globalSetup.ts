import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

/** Levanta un Postgres real y descartable para los tests de integración (se necesita la restricción de exclusión de verdad). */
export default async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'turnos-pg-'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'test', password: 'test', port: 54329, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('turnos_test');
  const url = 'postgresql://test:test@localhost:54329/turnos_test';
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
