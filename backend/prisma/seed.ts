import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

export async function seedUsers(db: PrismaClient = prisma): Promise<void> {
  const [ownerPassword, moderatorPassword] = await Promise.all([
    bcrypt.hash('Owner@12345', SALT_ROUNDS),
    bcrypt.hash('Moderator@12345', SALT_ROUNDS),
  ]);

  await db.user.upsert({
    where: { email: 'owner@gmail.com' },
    update: {},
    create: {
      firstName: 'Disenyo',
      lastName: 'Owner',
      email: 'owner@gmail.com',
      password: ownerPassword,
      phone: '+63 900 000 0001',
      role: UserRole.OWNER,
    },
  });

  await db.user.upsert({
    where: { email: 'moderator@gmail.com' },
    update: {},
    create: {
      firstName: 'Disenyo',
      lastName: 'Moderator',
      email: 'moderator@gmail.com',
      password: moderatorPassword,
      phone: '+63 900 000 0002',
      role: UserRole.MODERATOR,
    },
  });

  console.log('  Users seeded (1 OWNER, 1 MODERATOR).');
}

interface CategorySeed {
  name: string;
  slug: string;
  description: string;
  isActive?: boolean;
}

const CATEGORY_SEEDS: CategorySeed[] = [
  { name: 'Wall Panels', slug: 'wall-panels', description: 'Decorative and acoustic wall panels.', isActive: true },
  { name: 'Ceiling Panels', slug: 'ceiling-panels', description: 'Ceiling panel systems and tiles.', isActive: true },
  { name: 'Flooring Panels', slug: 'flooring-panels', description: 'Interior flooring panel solutions.', isActive: false },
  { name: 'Partition Panels', slug: 'partition-panels', description: 'Room divider and partition panels.', isActive: false },
  { name: 'Cladding Panels', slug: 'cladding-panels', description: 'Exterior and interior cladding panels.', isActive: false },
];

export async function seedCategories(db: PrismaClient = prisma): Promise<Map<string, string>> {
  const slugToId = new Map<string, string>();

  for (const seed of CATEGORY_SEEDS) {
    const category = await db.category.upsert({
      where: { slug: seed.slug },
      update: { isActive: seed.isActive ?? true },
      create: seed,
    });
    slugToId.set(category.slug, category.id);
  }

  console.log(`  ${CATEGORY_SEEDS.length} categories seeded.`);
  return slugToId;
}

export async function seedDatabase(db: PrismaClient = prisma): Promise<void> {
  console.log('Seeding PanelScan database...');

  await seedUsers(db);
  await seedCategories(db);

  console.log('Seeding complete.');
}

async function main(): Promise<void> {
  await seedDatabase(prisma);
}

const isDirectScriptExecution =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1] && (process.argv[1].replace(/\\/g, '/').endsWith('prisma/seed.ts') || process.argv[1].replace(/\\/g, '/').endsWith('seed.ts')));

if (isDirectScriptExecution) {
  main()
    .catch((error: unknown) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
