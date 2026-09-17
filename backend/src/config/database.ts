import { PrismaClient } from '@prisma/client';

import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// Reuse a single PrismaClient instance across module reloads in development
// (tsx watch) and across warm serverless/container invocations in production
// to avoid exhausting the CockroachDB connection pool.
export const prisma = global.__prisma ?? createPrismaClient();

global.__prisma = prisma;

