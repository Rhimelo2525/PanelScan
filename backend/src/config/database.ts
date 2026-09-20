import { PrismaClient } from '@prisma/client';

import { env } from './env';
import { getBackupPrisma } from './backupDatabase';

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

export type DatabaseHealthStatus = 'connected' | 'disconnected' | 'not_configured';

// Monitoring only - this never changes which database the application
// reads/writes from. CockroachDB (via `prisma` above) is the only database
// the running app ever queries; the backup client is only reachable from
// here and from the one-way sync job.
export const checkPrimaryHealth = async (): Promise<DatabaseHealthStatus> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'connected';
  } catch {
    return 'disconnected';
  }
};

export const checkBackupHealth = async (): Promise<DatabaseHealthStatus> => {
  const backupPrisma = getBackupPrisma();
  if (!backupPrisma) return 'not_configured';

  try {
    await backupPrisma.$queryRaw`SELECT 1`;
    return 'connected';
  } catch {
    return 'disconnected';
  }
};

