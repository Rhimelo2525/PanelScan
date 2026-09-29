/**
 * Checks that the Supabase backup database can accept every row the main
 * database produces - without writing anything. Run it after any change to
 * prisma/schema.prisma, and before deploying:
 *
 *   npm run backup:verify
 *
 * Exits non-zero (and lists each problem) when schema.backup.prisma, the
 * generated backup client, or the live backup tables have drifted.
 */
import { getBackupPrisma } from '../src/config/backupDatabase';
import {
  BACKUP_SCHEMA_PATH,
  MAIN_SCHEMA_PATH,
  checkGeneratedClient,
  checkLiveBackupSchema,
  compareSchemas,
  loadSchema,
} from '../src/utils/backupSchema';

const report = (label: string, problems: string[]): boolean => {
  console.log(`[backup-verify] ${label}: ${problems.length === 0 ? 'OK' : `${problems.length} problem(s)`}`);
  for (const problem of problems) console.log(`  - ${problem}`);
  return problems.length === 0;
};

const main = async () => {
  const backupSchema = loadSchema(BACKUP_SCHEMA_PATH);
  let ok = report('schema.prisma vs schema.backup.prisma', compareSchemas(loadSchema(MAIN_SCHEMA_PATH), backupSchema));
  ok = report('generated backup client', checkGeneratedClient()) && ok;

  const backupPrisma = getBackupPrisma();
  if (!backupPrisma) {
    ok = report('live backup database', ['BACKUP_DATABASE_URL is not configured, or the backup client has not been generated.']) && ok;
  } else {
    try {
      ok = report('live backup database', await checkLiveBackupSchema(backupPrisma, backupSchema)) && ok;
    } finally {
      await backupPrisma.$disconnect();
    }
  }

  if (!ok) {
    console.log('[backup-verify] Fix schema.backup.prisma, then run "npm run prisma:backup:push" and "npm run prisma:backup:generate".');
    process.exitCode = 1;
  }
};

main().catch((err) => {
  console.error('[backup-verify] Unexpected error:', err);
  process.exitCode = 1;
});
