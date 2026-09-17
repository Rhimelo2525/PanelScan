import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Every test file shares one CockroachDB test database plus a global
    // afterEach cleanup (see tests/setup.ts). Running test files in parallel
    // worker processes would let one file's cleanup wipe another file's
    // in-progress fixtures. A single fork keeps the whole suite sequential
    // so tests never race each other over shared database state.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/types/**', 'src/config/env.ts'],
    },
  },
});
