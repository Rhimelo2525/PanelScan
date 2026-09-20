import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __backupPrisma: unknown | undefined;
}

// The backup Prisma client (Supabase) is generated from a separate schema
// (prisma/schema.backup.prisma) into its own output folder, so it never
// collides with the primary @prisma/client used against CockroachDB. That
// generated module only exists after `npm run prisma:backup:generate` has
// been run at least once, so this import is done lazily/defensively -
// nothing in the normal app boot path should fail just because the backup
// client hasn't been generated yet on a given machine.
type BackupPrismaClient = import('../generated/backup-client').PrismaClient;

let backupClientCtor: (new (...args: unknown[]) => BackupPrismaClient) | null = null;

const loadBackupClientCtor = (): (new (...args: unknown[]) => BackupPrismaClient) | null => {
  if (backupClientCtor) return backupClientCtor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const generated = require('../generated/backup-client');
    backupClientCtor = generated.PrismaClient;
    return backupClientCtor;
  } catch {
    return null;
  }
};

// Returns null when the backup database isn't configured (BACKUP_DATABASE_URL
// unset) or the backup client hasn't been generated yet - callers (health
// checks, the sync job) must treat null as "backup unavailable", never throw.
export const getBackupPrisma = (): BackupPrismaClient | null => {
  if (!env.BACKUP_DATABASE_URL) return null;

  if (global.__backupPrisma) return global.__backupPrisma as BackupPrismaClient;

  const Ctor = loadBackupClientCtor();
  if (!Ctor) return null;

  const client = new Ctor({
    datasources: { db: { url: env.BACKUP_DATABASE_URL } },
  }) as BackupPrismaClient;

  global.__backupPrisma = client;
  return client;
};
