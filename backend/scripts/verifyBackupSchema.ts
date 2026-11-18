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

      const tables = await backupPrisma.$queryRawUnsafe<Array<{ tablename: string; rowsecurity: boolean }>>(
        `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      const disabled = tables.filter((t) => !t.rowsecurity);
      if (disabled.length > 0) {
        console.log(`[backup-verify] Enabling Row-Level Security (RLS) on ${disabled.length} public table(s): ${disabled.map((t) => t.tablename).join(', ')}...`);
        for (const t of disabled) {
          const ident = t.tablename.replace(/"/g, '""');
          await backupPrisma.$executeRawUnsafe(`ALTER TABLE "public"."${ident}" ENABLE ROW LEVEL SECURITY`);
        }
      }
      await backupPrisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`);
      await backupPrisma.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated`);
      await backupPrisma.$executeRawUnsafe(`REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated`);
      await backupPrisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated`);

      const afterTables = await backupPrisma.$queryRawUnsafe<Array<{ tablename: string; rowsecurity: boolean }>>(
        `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      const grants = await backupPrisma.$queryRawUnsafe<Array<{ table_name: string; grantee: string; privilege_type: string }>>(
        `SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')`,
      );
      const views = await backupPrisma.$queryRawUnsafe<Array<{ viewname: string }>>(
        `SELECT viewname FROM pg_views WHERE schemaname = 'public'`,
      );
      const securityProblems = [
        ...afterTables.filter((t) => !t.rowsecurity).map((t) => `Table "${t.tablename}" has RLS disabled in public schema.`),
        ...grants.map((g) => `Table "${g.table_name}" still grants ${g.privilege_type} to ${g.grantee}.`),
        ...views.map((v) => `Public view "${v.viewname}" exists in public schema.`),
      ];
      ok = report(`row-level security & public grants (${afterTables.length} public tables)`, securityProblems) && ok;
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
