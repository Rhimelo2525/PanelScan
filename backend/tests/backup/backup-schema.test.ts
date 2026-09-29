import { describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_PATH,
  MAIN_SCHEMA_PATH,
  checkLiveBackupSchema,
  compareSchemas,
  loadSchema,
  parsePrismaSchema,
} from '../../src/utils/backupSchema';

/**
 * Guards against the "Backup sync failed" alert caused by schema drift: a
 * column added to schema.prisma but not to schema.backup.prisma makes every
 * real-time backup upsert of that model fail. No network - the live-database
 * side of the same check runs via `npm run backup:verify`.
 */

const MAIN = `
enum Status {
  OPEN
  CLOSED
}
model User {
  id     String  @id @db.Uuid
  email  String  @unique
  orders Order[]
  @@map("users")
}
model Order {
  id         String   @id @db.Uuid
  customerId String   @map("customer_id") @db.Uuid
  status     Status   @default(OPEN)
  notes      String?
  customer   User     @relation(fields: [customerId], references: [id])
  @@map("orders")
}
`;

const withoutSyncOrderNoise = (problems: string[]) => problems.filter((p) => !p.includes('SYNC_ORDER'));

describe('Backup schema parity', () => {
  it('schema.backup.prisma mirrors every column, enum and table of schema.prisma', () => {
    expect(compareSchemas(loadSchema(MAIN_SCHEMA_PATH), loadSchema(BACKUP_SCHEMA_PATH))).toEqual([]);
  });

  it('parses scalar columns and skips relation fields', () => {
    const order = parsePrismaSchema(MAIN).models.get('Order')!;
    expect(order.table).toBe('orders');
    expect(order.scalars.map((f) => f.column)).toEqual(['id', 'customer_id', 'status', 'notes']);
    expect(order.scalars.find((f) => f.name === 'notes')!.optional).toBe(true);
  });

  it('flags a column added to the main schema but not to the backup schema', () => {
    const main = parsePrismaSchema(MAIN.replace('notes      String?', 'notes      String?\n  quotedAt DateTime? @map("quoted_at")'));
    const problems = withoutSyncOrderNoise(compareSchemas(main, parsePrismaSchema(MAIN)));
    expect(problems).toEqual(['Order.quotedAt: column missing from schema.backup.prisma.']);
  });

  it('flags a column whose type, optionality or mapping differs', () => {
    const backup = parsePrismaSchema(MAIN.replace('notes      String?', 'notes      String').replace('@map("customer_id")', '@map("customer")'));
    const problems = withoutSyncOrderNoise(compareSchemas(parsePrismaSchema(MAIN), backup));
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toMatch(/Order\.customerId: definition differs/);
    expect(problems.join('\n')).toMatch(/Order\.notes: definition differs/);
  });

  it('flags a new main-schema model that is neither mirrored nor explicitly excluded', () => {
    const main = parsePrismaSchema(`${MAIN}\nmodel Invoice {\n  id String @id\n}\n`);
    expect(compareSchemas(main, parsePrismaSchema(MAIN))).toContain(
      'Model Invoice exists in schema.prisma but not in schema.backup.prisma (mirror it, or add it to NOT_BACKED_UP_MODELS).',
    );
  });

  it('flags an enum value missing from the backup schema', () => {
    const backup = parsePrismaSchema(MAIN.replace('  CLOSED\n', ''));
    expect(withoutSyncOrderNoise(compareSchemas(parsePrismaSchema(MAIN), backup))).toEqual([
      'Enum Status values differ (main OPEN,CLOSED, backup OPEN).',
    ]);
  });

  it('flags a backup model that backup:sync would never copy', () => {
    expect(compareSchemas(parsePrismaSchema(MAIN), parsePrismaSchema(MAIN))).toContain(
      'SYNC_ORDER entry "payment" has no model in schema.backup.prisma.',
    );
  });
});

describe('Live backup database check', () => {
  type Column = { table_name: string; column_name: string; udt_name: string; is_nullable: 'YES' | 'NO'; column_default: string | null };
  const col = (table_name: string, column_name: string, udt_name: string, is_nullable: 'YES' | 'NO' = 'NO', column_default: string | null = null): Column =>
    ({ table_name, column_name, udt_name, is_nullable, column_default });

  const fakeClient = (columns: Column[], enums = [{ typname: 'Status', label: 'OPEN' }, { typname: 'Status', label: 'CLOSED' }]) => ({
    $queryRawUnsafe: async <T>(query: string): Promise<T> => (query.includes('information_schema') ? columns : enums) as T,
  });

  const IN_SYNC = [
    col('users', 'id', 'uuid'),
    col('users', 'email', 'text'),
    col('orders', 'id', 'uuid'),
    col('orders', 'customer_id', 'uuid'),
    col('orders', 'status', 'Status'),
    col('orders', 'notes', 'text', 'YES'),
  ];

  it('passes when the live tables match the backup schema', async () => {
    expect(await checkLiveBackupSchema(fakeClient(IN_SYNC), parsePrismaSchema(MAIN))).toEqual([]);
  });

  it('flags a schema change that was never pushed to the backup database', async () => {
    const schema = parsePrismaSchema(MAIN.replace('notes      String?', 'notes      String?\n  quotedAt DateTime? @map("quoted_at")'));
    expect(await checkLiveBackupSchema(fakeClient(IN_SYNC), schema)).toEqual(['orders.quoted_at: column missing in the backup database.']);
  });

  it('flags missing tables, missing enum values, wrong types and blocking extra columns', async () => {
    const columns = [
      ...IN_SYNC.filter((c) => c.table_name !== 'users').map((c) => (c.column_name === 'customer_id' ? { ...c, udt_name: 'int4' } : c)),
      col('orders', 'legacy_code', 'text'),
    ];
    const problems = await checkLiveBackupSchema(fakeClient(columns, [{ typname: 'Status', label: 'OPEN' }]), parsePrismaSchema(MAIN));
    expect(problems).toEqual(expect.arrayContaining([
      'Enum Status in the backup database is missing value(s): CLOSED.',
      'Table users (User) does not exist in the backup database.',
      'orders.customer_id: backup column type is int4, schema expects String.',
      'orders.legacy_code: NOT NULL column with no default exists only in the backup database - every insert will fail.',
    ]));
    expect(problems).toHaveLength(4);
  });
});
