import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

async function seedUsers(): Promise<void> {
  const [ownerPassword, moderatorPassword] = await Promise.all([
    bcrypt.hash('Owner@12345', SALT_ROUNDS),
    bcrypt.hash('Moderator@12345', SALT_ROUNDS),
  ]);

  await prisma.user.upsert({
    where: { email: 'owner@panelscan.com' },
    update: {},
    create: {
      firstName: 'Disenyo',
      lastName: 'Owner',
      email: 'owner@panelscan.com',
      password: ownerPassword,
      phone: '+63 900 000 0001',
      role: UserRole.OWNER,
    },
  });

  await prisma.user.upsert({
    where: { email: 'moderator@panelscan.com' },
    update: {},
    create: {
      firstName: 'Disenyo',
      lastName: 'Moderator',
      email: 'moderator@panelscan.com',
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
}

const CATEGORY_SEEDS: CategorySeed[] = [
  { name: 'Wall Panels', slug: 'wall-panels', description: 'Decorative and acoustic wall panels.' },
  { name: 'Ceiling Panels', slug: 'ceiling-panels', description: 'Ceiling panel systems and tiles.' },
  { name: 'Flooring Panels', slug: 'flooring-panels', description: 'Interior flooring panel solutions.' },
  { name: 'Partition Panels', slug: 'partition-panels', description: 'Room divider and partition panels.' },
  { name: 'Cladding Panels', slug: 'cladding-panels', description: 'Exterior and interior cladding panels.' },
];

async function seedCategories(): Promise<Map<string, string>> {
  const slugToId = new Map<string, string>();

  for (const seed of CATEGORY_SEEDS) {
    const category = await prisma.category.upsert({
      where: { slug: seed.slug },
      update: {},
      create: seed,
    });
    slugToId.set(category.slug, category.id);
  }

  console.log(`  ${CATEGORY_SEEDS.length} categories seeded.`);
  return slugToId;
}

interface ProductSeed {
  name: string;
  categorySlug: string;
  sku: string;
  price: number;
  width: number;
  height: number;
  thickness: number;
  material: string;
}

const PRODUCT_SEEDS: ProductSeed[] = [
  { name: 'Oak Veneer Wall Panel', categorySlug: 'wall-panels', sku: 'WP-OAK-001', price: 1850.0, width: 60, height: 240, thickness: 1.2, material: 'Oak Veneer' },
  { name: 'Acoustic Fabric Wall Panel', categorySlug: 'wall-panels', sku: 'WP-ACO-002', price: 2100.0, width: 60, height: 120, thickness: 2.5, material: 'Fabric-wrapped Foam' },
  { name: 'PVC Ceiling Tile', categorySlug: 'ceiling-panels', sku: 'CP-PVC-001', price: 450.0, width: 60, height: 60, thickness: 0.8, material: 'PVC' },
  { name: 'Gypsum Ceiling Panel', categorySlug: 'ceiling-panels', sku: 'CP-GYP-002', price: 620.0, width: 120, height: 60, thickness: 1.0, material: 'Gypsum' },
  { name: 'Vinyl Click Flooring Panel', categorySlug: 'flooring-panels', sku: 'FP-VIN-001', price: 980.0, width: 18, height: 122, thickness: 0.5, material: 'Vinyl' },
  { name: 'Laminate Flooring Panel', categorySlug: 'flooring-panels', sku: 'FP-LAM-002', price: 1120.0, width: 19, height: 128, thickness: 0.8, material: 'Laminate' },
  { name: 'Glass Partition Panel', categorySlug: 'partition-panels', sku: 'PP-GLS-001', price: 5200.0, width: 100, height: 240, thickness: 1.0, material: 'Tempered Glass' },
  { name: 'MDF Partition Panel', categorySlug: 'partition-panels', sku: 'PP-MDF-002', price: 2750.0, width: 90, height: 240, thickness: 1.8, material: 'MDF' },
  { name: 'Aluminum Cladding Panel', categorySlug: 'cladding-panels', sku: 'CL-ALU-001', price: 3400.0, width: 120, height: 240, thickness: 0.4, material: 'Aluminum Composite' },
  { name: 'Stone Veneer Cladding Panel', categorySlug: 'cladding-panels', sku: 'CL-STN-002', price: 4100.0, width: 60, height: 30, thickness: 2.0, material: 'Natural Stone Veneer' },
];

async function seedProducts(categorySlugToId: Map<string, string>): Promise<string[]> {
  const productIds: string[] = [];

  for (const seed of PRODUCT_SEEDS) {
    const categoryId = categorySlugToId.get(seed.categorySlug);
    if (!categoryId) {
      throw new Error(`Seed category not found for slug: ${seed.categorySlug}`);
    }

    const product = await prisma.product.upsert({
      where: { sku: seed.sku },
      update: {},
      create: {
        categoryId,
        name: seed.name,
        slug: seed.sku.toLowerCase(),
        sku: seed.sku,
        price: seed.price,
        width: seed.width,
        height: seed.height,
        thickness: seed.thickness,
        material: seed.material,
        description: `${seed.name} - premium ${seed.material} panel for interior projects.`,
      },
    });
    productIds.push(product.id);
  }

  console.log(`  ${PRODUCT_SEEDS.length} products seeded.`);
  return productIds;
}

async function seedInventory(productIds: string[]): Promise<void> {
  for (const productId of productIds) {
    await prisma.inventory.upsert({
      where: { productId },
      update: {},
      create: {
        productId,
        quantity: 100,
        reservedQty: 0,
        reorderLevel: 15,
        warehouseLocation: 'Main Warehouse - Bay A',
      },
    });
  }

  console.log('  Inventory seeded for every product.');
}

async function main(): Promise<void> {
  console.log('Seeding PanelScan database...');

  await seedUsers();
  const categorySlugToId = await seedCategories();
  const productIds = await seedProducts(categorySlugToId);
  await seedInventory(productIds);

  console.log('Seeding complete.');
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
