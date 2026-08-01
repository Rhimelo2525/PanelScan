import { BookingStatus, OrderStatus, PaymentStatus, UserRole } from '@prisma/client';
import type { Booking, Cart, CartItem, Category, Installer, Order, Payment, Product, User } from '@prisma/client';

import { prisma } from '../../src/config/database';
import { signToken } from '../../src/utils/jwt';
import { hashPassword } from '../../src/utils/password';
import { slugify } from '../../src/utils/slugify';

export const TEST_PASSWORD = 'Password123';

let userCounter = 0;
let categoryCounter = 0;
let productCounter = 0;
let installerCounter = 0;

export interface TestUser {
  user: User;
  token: string;
  password: string;
}

interface CreateTestUserOptions {
  role?: UserRole;
  email?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}

/**
 * Creates a user directly via Prisma (bypassing the register endpoint) and
 * signs a real JWT with the app's own `signToken`, so the token is 100%
 * authentic to `authenticate` middleware. Used to set up OWNER/MODERATOR
 * fixtures that the public register endpoint can never produce (it always
 * creates CUSTOMER).
 */
export const createTestUser = async (options: CreateTestUserOptions = {}): Promise<TestUser> => {
  userCounter += 1;
  const email = options.email ?? `test-user-${userCounter}-${Date.now()}@panelscan.test`;
  const password = TEST_PASSWORD;
  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      firstName: options.firstName ?? 'Test',
      lastName: options.lastName ?? 'User',
      email,
      password: hashedPassword,
      role: options.role ?? UserRole.CUSTOMER,
      isActive: options.isActive ?? true,
    },
  });

  const token = signToken({ userId: user.id, role: user.role });

  return { user, token, password };
};

export const createOwner = (options: Omit<CreateTestUserOptions, 'role'> = {}): Promise<TestUser> =>
  createTestUser({ ...options, role: UserRole.OWNER });

export const createModerator = (options: Omit<CreateTestUserOptions, 'role'> = {}): Promise<TestUser> =>
  createTestUser({ ...options, role: UserRole.MODERATOR });

export const createCustomer = (options: Omit<CreateTestUserOptions, 'role'> = {}): Promise<TestUser> =>
  createTestUser({ ...options, role: UserRole.CUSTOMER });

interface CreateTestCategoryOptions {
  name?: string;
  isActive?: boolean;
}

export const createTestCategory = async (options: CreateTestCategoryOptions = {}): Promise<Category> => {
  categoryCounter += 1;
  const name = options.name ?? `Test Category ${categoryCounter}-${Date.now()}`;

  return prisma.category.create({
    data: {
      name,
      slug: slugify(name),
      isActive: options.isActive ?? true,
    },
  });
};

export interface CreateTestProductOptions {
  categoryId?: string;
  name?: string;
  price?: number;
  isFeatured?: boolean;
  isActive?: boolean;
  deletedAt?: Date;
  withInventory?: boolean;
  quantity?: number;
  reservedQty?: number;
  reorderLevel?: number;
}

export const createTestProduct = async (options: CreateTestProductOptions = {}): Promise<Product> => {
  productCounter += 1;
  const categoryId = options.categoryId ?? (await createTestCategory()).id;
  const name = options.name ?? `Test Product ${productCounter}-${Date.now()}`;
  const sku = `TST-${productCounter}-${Date.now()}`;

  const product = await prisma.product.create({
    data: {
      categoryId,
      name,
      slug: slugify(name),
      sku,
      price: options.price ?? 100,
      isFeatured: options.isFeatured ?? false,
      isActive: options.isActive ?? true,
      deletedAt: options.deletedAt,
    },
  });

  if (options.withInventory) {
    await prisma.inventory.create({
      data: {
        productId: product.id,
        quantity: options.quantity ?? 50,
        reservedQty: options.reservedQty ?? 0,
        reorderLevel: options.reorderLevel ?? 10,
      },
    });
  }

  return product;
};

export const authHeader = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

/**
 * Gets-or-creates a customer's cart directly via Prisma, so cart tests can
 * seed pre-existing state (e.g. for update/remove/clear) without depending
 * on the add-item endpoint itself already working.
 */
export const createTestCart = async (customerId: string): Promise<Cart> => {
  return prisma.cart.upsert({ where: { customerId }, update: {}, create: { customerId } });
};

export const addCartItem = async (cartId: string, productId: string, quantity: number): Promise<CartItem> => {
  return prisma.cartItem.create({ data: { cartId, productId, quantity } });
};

export interface CreateTestOrderItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  productName?: string;
}

export interface CreateTestOrderOptions {
  customerId: string;
  status?: OrderStatus;
  items?: CreateTestOrderItemInput[];
}

/**
 * Creates an Order (+ OrderItems) directly via Prisma, bypassing the
 * checkout endpoint. Used to seed orders in a specific status for testing
 * cancel/status-transition rules in isolation from checkout logic itself.
 */
export const createTestOrder = async (options: CreateTestOrderOptions): Promise<Order> => {
  const items = options.items ?? [];
  const subtotal = items.reduce((sum, item) => sum + (item.unitPrice ?? 100) * item.quantity, 0);

  return prisma.order.create({
    data: {
      orderNumber: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerId: options.customerId,
      status: options.status ?? OrderStatus.PENDING,
      subtotal,
      shippingFee: 0,
      totalAmount: subtotal,
      shippingAddress: '123 Test Street, Test City, Test Province, 1234',
      items: {
        create: items.map((item) => ({
          productId: item.productId,
          productName: item.productName ?? 'Test Product',
          unitPrice: item.unitPrice ?? 100,
          quantity: item.quantity,
          lineTotal: (item.unitPrice ?? 100) * item.quantity,
        })),
      },
    },
  });
};

export interface CreateTestPaymentOptions {
  orderId: string;
  status?: PaymentStatus;
  amount?: number;
  transactionRef?: string;
}

/**
 * Creates a Payment directly via Prisma, bypassing POST /api/payments/create
 * (which calls out to PayMongo). Used to seed a pre-existing payment for
 * "already paid" validation tests and as the target row for webhook tests.
 */
export const createTestPayment = async (options: CreateTestPaymentOptions): Promise<Payment> => {
  return prisma.payment.create({
    data: {
      orderId: options.orderId,
      status: options.status ?? PaymentStatus.PENDING,
      method: 'PayMongo',
      amount: options.amount ?? 100,
      transactionRef: options.transactionRef,
    },
  });
};

export interface CreateTestBookingOptions {
  customerId: string;
  installerId?: string;
  status?: BookingStatus;
  scheduledDate?: Date;
  address?: string;
  notes?: string;
}

/** A scheduledDate a week out by default, since createBookingSchema requires a future date. */
export const createTestBooking = async (options: CreateTestBookingOptions): Promise<Booking> => {
  return prisma.booking.create({
    data: {
      customerId: options.customerId,
      installerId: options.installerId,
      status: options.status ?? BookingStatus.PENDING,
      scheduledDate: options.scheduledDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      address: options.address ?? '123 Test Street, Test City, Test Province, 1234',
      notes: options.notes,
    },
  });
};

export interface CreateTestInstallerOptions {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  specialty?: string;
  isActive?: boolean;
}

export const createTestInstaller = async (options: CreateTestInstallerOptions = {}): Promise<Installer> => {
  installerCounter += 1;
  return prisma.installer.create({
    data: {
      firstName: options.firstName ?? 'Test',
      lastName: options.lastName ?? `Installer${installerCounter}`,
      email: options.email ?? `installer-${installerCounter}-${Date.now()}@panelscan.test`,
      phone: options.phone ?? '09171234567',
      specialty: options.specialty,
      isActive: options.isActive ?? true,
    },
  });
};
