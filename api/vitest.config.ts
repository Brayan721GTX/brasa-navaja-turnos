import { defineConfig } from 'vitest/config';

const TEST_DB = 'postgresql://test:test@localhost:54329/turnos_test';

export default defineConfig({
  test: {
    globalSetup: ['tests/helpers/globalSetup.ts'],
    env: {
      DATABASE_URL: TEST_DB,
      DIRECT_URL: TEST_DB,
      JWT_SECRET: 'test-secret',
      DEMO_MODE: 'true',
      CRON_SECRET: 'test-cron',
      NODE_ENV: 'test',
    },
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
