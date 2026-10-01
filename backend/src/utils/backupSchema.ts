/**
 * Schema-parity checks for the Supabase backup database.
 *
 * Real-time backup syncs (backupSync.ts) upsert the FULL scalar row read from
 * the main database. The moment the backup side disagrees with the main side
 * on any column - a field added to schema.prisma but not to
 * schema.backup.prisma, a schema file changed but never `db push`ed to
 * Supabase, or a stale generated backup client - every upsert of that model
 * fails and staff get a "Backup sync failed" alert. These checks catch each
 * of those three drift points before that happens:
 *
 *  - compareSchemas():      schema.prisma vs schema.backup.prisma (file level,
 *                           no network - run by the test suite)
 *  - checkLiveBackupSchema(): schema.backup.prisma vs the real Supabase tables
 *  - checkGeneratedClient():  schema.backup.prisma vs the generated client
 *                             (both run by `npm run backup:verify` and as a
 *                             pre-flight of `npm run backup:sync`)
 */
import fs from 'fs';
import path from 'path';

// Dependency order matters: a row can only be inserted into the backup
// database after any row it has a foreign key to already exists there.
// This mirrors the parent-before-child ordering in prisma/schema.prisma.
export const SYNC_ORDER = [
  'user',
  'customerAddress',
  'category',
  'product',
  'productImage',
  'inventory',
  'cart',
  'cartItem',
  'order',
  'orderItem',
  'payment',
  'delivery',
  'deliveryPayment',
  'installer',
  'booking',
  'measurement',
  'feedback',
  'chatRoom',
  'chatParticipant',
  'message',
  'notification',
  'project',
  'request',
  'refreshToken',
  'activityLog',
] as const;

// Main-database models deliberately NOT mirrored to the backup: short-lived
// one-time codes and login-lockout counters, with no disaster-recovery value. Any other model added to
// schema.prisma must either be mirrored or listed here - the parity test
// fails until someone makes that choice explicitly.
export const NOT_BACKED_UP_MODELS = ['PasswordResetCode', 'EmailVerificationCode', 'LoginThrottle'] as const;

export const MAIN_SCHEMA_PATH = path.resolve(__dirname, '../../prisma/schema.prisma');
export const BACKUP_SCHEMA_PATH = path.resolve(__dirname, '../../prisma/schema.backup.prisma');
export const GENERATED_BACKUP_SCHEMA_PATH = path.resolve(__dirname, '../generated/backup-client/schema.prisma');

export interface ScalarField {
  name: string;
  column: string;
  type: string;
  optional: boolean;
  list: boolean;
  /** Field attributes, whitespace-normalised (e.g. `@map("x") @db.Uuid`). */
  attributes: string;
}

export interface ParsedModel {
  name: string;
  table: string;
  scalars: ScalarField[];
}

export interface ParsedSchema {
  models: Map<string, ParsedModel>;
  enums: Map<string, string[]>;
}

const stripComment = (line: string): string => {
  // Prisma comments start with `//`; string literals in attributes never
  // contain `//` in these schemas, so a plain cut is enough.
  const idx = line.indexOf('//');
  return (idx === -1 ? line : line.slice(0, idx)).trim();
};

/** Minimal Prisma schema parser: models (scalar fields only) and enums. */
export const parsePrismaSchema = (source: string): ParsedSchema => {
  const blocks: { kind: 'model' | 'enum'; name: string; lines: string[] }[] = [];
  let current: (typeof blocks)[number] | null = null;

  for (const raw of source.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line) continue;
    const open = /^(model|enum)\s+(\w+)\s*\{$/.exec(line);
    if (open) {
      current = { kind: open[1] as 'model' | 'enum', name: open[2]!, lines: [] };
      blocks.push(current);
    } else if (line === '}') {
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }

  const enums = new Map<string, string[]>();
  for (const block of blocks.filter((b) => b.kind === 'enum')) {
    enums.set(block.name, block.lines.map((l) => l.split(/\s+/)[0]!));
  }
  const modelNames = new Set(blocks.filter((b) => b.kind === 'model').map((b) => b.name));

  const models = new Map<string, ParsedModel>();
  for (const block of blocks.filter((b) => b.kind === 'model')) {
    let table = block.name;
    const scalars: ScalarField[] = [];
    for (const line of block.lines) {
      const tableMap = /^@@map\("([^"]+)"\)/.exec(line);
      if (tableMap) table = tableMap[1]!;
      if (line.startsWith('@@')) continue;

      const field = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!field) continue;
      const [, name, type, list, optional, rest] = field;
      if (modelNames.has(type!)) continue; // relation field, not a column

      const attributes = rest!.replace(/\s+/g, ' ').trim();
      const column = /@map\("([^"]+)"\)/.exec(attributes)?.[1] ?? name!;
      scalars.push({ name: name!, column, type: type!, optional: Boolean(optional), list: Boolean(list), attributes });
    }
    models.set(block.name, { name: block.name, table, scalars });
  }

  return { models, enums };
};

export const loadSchema = (filePath: string): ParsedSchema => parsePrismaSchema(fs.readFileSync(filePath, 'utf8'));

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * File-level parity between the main and backup schemas. Returns a list of
 * human-readable problems; empty means the backup schema can hold every row
 * the main database produces.
 */
export const compareSchemas = (main: ParsedSchema, backup: ParsedSchema): string[] => {
  const problems: string[] = [];
  const excluded = new Set<string>(NOT_BACKED_UP_MODELS);

  for (const name of main.models.keys()) {
    if (!excluded.has(name) && !backup.models.has(name)) {
      problems.push(`Model ${name} exists in schema.prisma but not in schema.backup.prisma (mirror it, or add it to NOT_BACKED_UP_MODELS).`);
    }
  }

  for (const [name, backupModel] of backup.models) {
    const mainModel = main.models.get(name);
    if (!mainModel) {
      problems.push(`Model ${name} exists in schema.backup.prisma but not in schema.prisma.`);
      continue;
    }
    if (mainModel.table !== backupModel.table) {
      problems.push(`${name}: table name differs (main "${mainModel.table}", backup "${backupModel.table}").`);
    }

    const backupFields = new Map(backupModel.scalars.map((f) => [f.name, f]));
    for (const field of mainModel.scalars) {
      const other = backupFields.get(field.name);
      if (!other) {
        problems.push(`${name}.${field.name}: column missing from schema.backup.prisma.`);
        continue;
      }
      backupFields.delete(field.name);
      const describe = (f: ScalarField) => `${f.type}${f.list ? '[]' : ''}${f.optional ? '?' : ''} ${f.attributes}`.trim();
      if (describe(field) !== describe(other)) {
        problems.push(`${name}.${field.name}: definition differs (main "${describe(field)}", backup "${describe(other)}").`);
      }
    }
    for (const extra of backupFields.values()) {
      problems.push(`${name}.${extra.name}: column exists only in schema.backup.prisma.`);
    }
  }

  for (const [name, values] of main.enums) {
    const other = backup.enums.get(name);
    if (!other) problems.push(`Enum ${name} missing from schema.backup.prisma.`);
    else if (values.join(',') !== other.join(',')) {
      problems.push(`Enum ${name} values differ (main ${values.join(',')}, backup ${other.join(',')}).`);
    }
  }

  const synced = new Set<string>(SYNC_ORDER);
  for (const name of backup.models.keys()) {
    if (!synced.has(lowerFirst(name))) problems.push(`Model ${name} is in schema.backup.prisma but missing from SYNC_ORDER, so backup:sync never copies it.`);
  }
  for (const delegate of SYNC_ORDER) {
    if (![...backup.models.keys()].some((m) => lowerFirst(m) === delegate)) problems.push(`SYNC_ORDER entry "${delegate}" has no model in schema.backup.prisma.`);
  }

  return problems;
};

// Postgres udt_name for each Prisma scalar type (enums use their own name).
const PG_TYPES: Record<string, string[]> = {
  String: ['text', 'varchar', 'uuid', 'bpchar'],
  Int: ['int4', 'int2'],
  BigInt: ['int8'],
  Float: ['float8', 'float4'],
  Decimal: ['numeric'],
  Boolean: ['bool'],
  DateTime: ['timestamp', 'timestamptz', 'date'],
  Json: ['jsonb', 'json'],
  Bytes: ['bytea'],
};

interface LiveColumn {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

/**
 * Compares schema.backup.prisma against the tables that actually exist in
 * the Supabase backup database - catches a schema change that was committed
 * but never pushed with `npm run prisma:backup:push`.
 */
export const checkLiveBackupSchema = async (client: RawQueryClient, backup: ParsedSchema = loadSchema(BACKUP_SCHEMA_PATH)): Promise<string[]> => {
  const problems: string[] = [];
  const columns = await client.$queryRawUnsafe<LiveColumn[]>(
    `SELECT table_name, column_name, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const enumRows = await client.$queryRawUnsafe<{ typname: string; label: string }[]>(
    `SELECT t.typname, e.enumlabel AS label FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'`,
  );

  const byTable = new Map<string, Map<string, LiveColumn>>();
  for (const col of columns) {
    if (!byTable.has(col.table_name)) byTable.set(col.table_name, new Map());
    byTable.get(col.table_name)!.set(col.column_name, col);
  }
  const liveEnums = new Map<string, Set<string>>();
  for (const row of enumRows) {
    if (!liveEnums.has(row.typname)) liveEnums.set(row.typname, new Set());
    liveEnums.get(row.typname)!.add(row.label);
  }

  for (const [name, values] of backup.enums) {
    const live = liveEnums.get(name);
    if (!live) {
      problems.push(`Enum ${name} does not exist in the backup database.`);
      continue;
    }
    const missing = values.filter((v) => !live.has(v));
    if (missing.length) problems.push(`Enum ${name} in the backup database is missing value(s): ${missing.join(', ')}.`);
  }

  for (const model of backup.models.values()) {
    const liveColumns = byTable.get(model.table);
    if (!liveColumns) {
      problems.push(`Table ${model.table} (${model.name}) does not exist in the backup database.`);
      continue;
    }
    const expected = new Set<string>();
    for (const field of model.scalars) {
      expected.add(field.column);
      const live = liveColumns.get(field.column);
      if (!live) {
        problems.push(`${model.table}.${field.column}: column missing in the backup database.`);
        continue;
      }
      const expectedTypes = backup.enums.has(field.type) ? [field.type] : PG_TYPES[field.type] ?? [];
      const liveType = field.list ? live.udt_name.replace(/^_/, '') : live.udt_name;
      if (expectedTypes.length && !expectedTypes.includes(liveType)) {
        problems.push(`${model.table}.${field.column}: backup column type is ${live.udt_name}, schema expects ${field.type}.`);
      }
      if (!field.optional && !field.list && live.is_nullable === 'YES') {
        problems.push(`${model.table}.${field.column}: nullable in the backup database but required in the schema.`);
      }
      if (field.optional && live.is_nullable === 'NO') {
        problems.push(`${model.table}.${field.column}: NOT NULL in the backup database but optional in the schema - rows with no value will fail.`);
      }
    }
    for (const live of liveColumns.values()) {
      if (!expected.has(live.column_name) && live.is_nullable === 'NO' && live.column_default === null) {
        problems.push(`${model.table}.${live.column_name}: NOT NULL column with no default exists only in the backup database - every insert will fail.`);
      }
    }
  }

  return problems;
};

/**
 * The generated backup client embeds a copy of the schema it was built from.
 * If that copy differs from schema.backup.prisma, a running server or the
 * sync job would upsert with an out-of-date column list.
 */
export const checkGeneratedClient = (): string[] => {
  if (!fs.existsSync(GENERATED_BACKUP_SCHEMA_PATH)) {
    return ['The backup Prisma client has not been generated (run "npm run prisma:backup:generate").'];
  }
  // `prisma generate` re-formats the copy it embeds, so compare the parsed
  // structure rather than the raw text.
  const current = describeSchema(loadSchema(BACKUP_SCHEMA_PATH));
  const generated = describeSchema(loadSchema(GENERATED_BACKUP_SCHEMA_PATH));
  const stale = [...current.keys()].filter((key) => current.get(key) !== generated.get(key));
  stale.push(...[...generated.keys()].filter((key) => !current.has(key)));
  return stale.length === 0
    ? []
    : [`The generated backup Prisma client is out of date with schema.backup.prisma (differs in: ${stale.join(', ')}). Run "npm run prisma:backup:generate", then restart the server.`];
};

const describeSchema = (schema: ParsedSchema): Map<string, string> => {
  const out = new Map<string, string>();
  for (const model of schema.models.values()) {
    out.set(model.name, `${model.table}|${model.scalars.map((f) => `${f.name}:${f.type}${f.list ? '[]' : ''}${f.optional ? '?' : ''} ${f.attributes}`).join('|')}`);
  }
  for (const [name, values] of schema.enums) out.set(`enum ${name}`, values.join(','));
  return out;
};
