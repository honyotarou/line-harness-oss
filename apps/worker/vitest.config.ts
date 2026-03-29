import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['development', 'browser', 'module', 'import', 'default'],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
    benchmark: {
      include: ['tests/**/*.bench.ts'],
    },
  },
});
