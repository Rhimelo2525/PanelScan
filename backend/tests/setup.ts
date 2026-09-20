import { afterAll, afterEach, beforeAll } from 'vitest';

import { prisma } from '../src/config/database';
import { cleanDatabase, disconnectDatabase } from './helpers/db';
import { seedDatabase } from '../prisma/seed';

beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL || '';
  const isDedicatedTestDb = dbUrl.includes('panelscan_test') || dbUrl.includes('localhost:26257/panelscan_test');

  if (!isDedicatedTestDb) {
    throw new Error(
      '\n[CRITICAL SAFETY STOP] Tests were attempted against a live/shared database!\n' +
        'Create .env.test pointing to a dedicated test database (e.g. localhost:26257/panelscan_test) before running tests.\n'
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error(
      '\nCould not reach the test database.\n' +
        'Make sure .env.test exists (copy .env.test.example), DATABASE_URL points to a\n' +
        'real, reachable CockroachDB TEST database (never your dev/prod one - every table\n' +
        'is truncated after each test), and migrations have been applied via:\n' +
        '  npm run test:migrate\n',
    );
    throw error;
  }

  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  const dbUrl = process.env.DATABASE_URL || '';
  const isDedicatedTestDb = dbUrl.includes('panelscan_test') || dbUrl.includes('localhost:26257/panelscan_test');

  if (isDedicatedTestDb) {
    try {
      await seedDatabase(prisma);
    } catch (error) {
      console.error('Failed to restore seed data in afterAll:', error);
    }
  }
  await disconnectDatabase();
});
