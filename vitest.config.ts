import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', fileParallelism: false, globalSetup: ['tests/global-setup.ts'], env: { NODE_ENV: 'test', SESSION_SECRET: 'segredo-so-para-testes-0123456789abcdef-xyz', STORAGE_DIR: '/tmp/painel-test-storage', DATABASE_URL: 'postgres://painel:painel_dev@localhost:5432/painel_test' } },
});
