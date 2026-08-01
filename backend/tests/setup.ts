import { afterAll, afterEach, beforeAll } from 'vitest';

import { prisma } from '../src/config/database';
import { cleanDatabase, disconnectDatabase } from './helpers/db';

beforeAll(async () => {
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
  await disconnectDatabase();
});
