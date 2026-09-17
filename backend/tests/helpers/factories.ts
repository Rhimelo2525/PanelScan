import { BookingStatus, NotificationType, OrderStatus, PaymentStatus, ProjectStatus, RequestStatus, RequestType, UserRole } from '@prisma/client';
import type {
  Booking,
  Cart,
  CartItem,
  Category,
  ChatParticipant,
  ChatRoom,
  Delivery,
  Feedback,
  Installer,
  Measurement,
  Message,
  Notification,
  Order,
  Payment,
  Product,
  Project,
  RefreshToken,
  Request as RequestModel,
  User,
} from '@prisma/client';

import { prisma } from '../../src/config/database';
import { signToken } from '../../src/utils/jwt';
import { hashPassword } from '../../src/utils/password';
import { generateRefreshToken, hashRefreshToken } from '../../src/utils/refreshToken';
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
  width?: number;
  height?: number;
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
      width: options.width,
      height: options.height,
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

export interface CreateTestRefreshTokenOptions {
  userId: string;
  expiresAt?: Date;
  revokedAt?: Date;
}

export interface TestRefreshToken {
  plainToken: string;
  record: RefreshToken;
}

/**
 * Creates a RefreshToken row directly via Prisma (bypassing login), hashing
 * a freshly generated plaintext token the same way the real service does.
 * Lets tests deterministically construct expired/revoked tokens without
 * waiting on real time or going through rotation first.
 */
export const createTestRefreshToken = async (options: CreateTestRefreshTokenOptions): Promise<TestRefreshToken> => {
  const plainToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(plainToken);

  const record = await prisma.refreshToken.create({
    data: {
      userId: options.userId,
      tokenHash,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revokedAt: options.revokedAt,
    },
  });

  return { plainToken, record };
};

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
  paidAt?: Date;
}

/**
 * Creates a Payment directly via Prisma, bypassing POST /api/payments/create
 * (which calls out to PayMongo). Used to seed a pre-existing payment for
 * "already paid" validation tests and as the target row for webhook tests.
 * `paidAt` defaults to "now" when status is PAID and no explicit value is
 * given (mirroring what a real webhook-confirmed payment looks like), so
 * analytics tests can rely on PAID payments always having a paidAt without
 * every call site needing to set it manually.
 */
export const createTestPayment = async (options: CreateTestPaymentOptions): Promise<Payment> => {
  return prisma.payment.create({
    data: {
      orderId: options.orderId,
      status: options.status ?? PaymentStatus.PENDING,
      method: 'PayMongo',
      amount: options.amount ?? 100,
      transactionRef: options.transactionRef,
      paidAt: options.paidAt ?? (options.status === PaymentStatus.PAID ? new Date() : undefined),
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

export interface CreateTestChatRoomOptions {
  subject?: string;
  participantIds?: string[];
}

/**
 * Creates a ChatRoom directly via Prisma, bypassing POST /api/chat, with an
 * optional set of initial participants (nested create, one ChatParticipant
 * row per id).
 */
export const createTestChatRoom = async (options: CreateTestChatRoomOptions = {}): Promise<ChatRoom> => {
  return prisma.chatRoom.create({
    data: {
      subject: options.subject,
      participants: options.participantIds
        ? { create: options.participantIds.map((userId) => ({ userId })) }
        : undefined,
    },
  });
};

export const addChatParticipant = async (chatRoomId: string, userId: string): Promise<ChatParticipant> => {
  return prisma.chatParticipant.upsert({
    where: { chatRoomId_userId: { chatRoomId, userId } },
    update: {},
    create: { chatRoomId, userId },
  });
};

export interface CreateTestMessageOptions {
  chatRoomId: string;
  senderId: string;
  content?: string;
  isRead?: boolean;
}

export const createTestMessage = async (options: CreateTestMessageOptions): Promise<Message> => {
  return prisma.message.create({
    data: {
      chatRoomId: options.chatRoomId,
      senderId: options.senderId,
      content: options.content ?? 'Test message content.',
      isRead: options.isRead ?? false,
    },
  });
};

export interface CreateTestNotificationOptions {
  userId: string;
  type?: NotificationType;
  title?: string;
  message?: string;
  isRead?: boolean;
  metadata?: object;
}

/** Creates a Notification directly via Prisma, bypassing the automatic triggers, for testing the CRUD endpoints in isolation. */
export const createTestNotification = async (options: CreateTestNotificationOptions): Promise<Notification> => {
  return prisma.notification.create({
    data: {
      userId: options.userId,
      type: options.type ?? NotificationType.SYSTEM,
      title: options.title ?? 'Test notification',
      message: options.message ?? 'Test notification message.',
      isRead: options.isRead ?? false,
      metadata: options.metadata,
    },
  });
};

export interface CreateTestFeedbackOptions {
  customerId: string;
  orderId?: string;
  rating?: number;
  comment?: string;
}

/** Creates a Feedback directly via Prisma, bypassing POST /api/feedback (and its completed-order/duplicate checks), for testing the other endpoints in isolation. */
export const createTestFeedback = async (options: CreateTestFeedbackOptions): Promise<Feedback> => {
  return prisma.feedback.create({
    data: {
      customerId: options.customerId,
      orderId: options.orderId,
      rating: options.rating ?? 5,
      comment: options.comment ?? 'Great service, very satisfied.',
    },
  });
};

export interface CreateTestProjectOptions {
  customerId: string;
  ownerId?: string;
  moderatorId?: string;
  name?: string;
  description?: string;
  notes?: string;
  status?: ProjectStatus;
  budget?: number;
  startDate?: Date;
  endDate?: Date;
}

/** Creates a Project directly via Prisma, bypassing POST /api/projects (and its assignment-rule checks), for testing the other endpoints in isolation. */
export const createTestProject = async (options: CreateTestProjectOptions): Promise<Project> => {
  return prisma.project.create({
    data: {
      customerId: options.customerId,
      ownerId: options.ownerId,
      moderatorId: options.moderatorId,
      name: options.name ?? 'Test Project',
      description: options.description,
      notes: options.notes,
      status: options.status ?? ProjectStatus.PENDING,
      budget: options.budget,
      startDate: options.startDate,
      endDate: options.endDate,
    },
  });
};

export interface CreateTestRequestOptions {
  requestedById: string;
  reviewedById?: string;
  type?: RequestType;
  status?: RequestStatus;
  title?: string;
  description?: string;
  reviewNote?: string;
  reviewedAt?: Date;
}

/** Creates a Request directly via Prisma, bypassing POST /api/requests (and its workflow checks), for testing the other endpoints in isolation. */
export const createTestRequest = async (options: CreateTestRequestOptions): Promise<RequestModel> => {
  return prisma.request.create({
    data: {
      requestedById: options.requestedById,
      reviewedById: options.reviewedById,
      type: options.type ?? RequestType.OTHER,
      status: options.status ?? RequestStatus.PENDING,
      title: options.title ?? 'Test Request',
      description: options.description,
      reviewNote: options.reviewNote,
      reviewedAt: options.reviewedAt,
    },
  });
};

export interface CreateTestMeasurementOptions {
  customerId: string;
  label?: string;
  width?: number;
  height?: number;
  depth?: number;
  unit?: string;
  imageUrl?: string;
  arDataUrl?: string;
}

/** Creates a Measurement directly via Prisma, bypassing POST /api/ar/measurements, for testing the other endpoints in isolation. */
export const createTestMeasurement = async (options: CreateTestMeasurementOptions): Promise<Measurement> => {
  return prisma.measurement.create({
    data: {
      customerId: options.customerId,
      label: options.label,
      width: options.width ?? 3,
      height: options.height ?? 2.5,
      depth: options.depth,
      unit: options.unit ?? 'm',
      imageUrl: options.imageUrl,
      arDataUrl: options.arDataUrl,
    },
  });
};

export interface CreateTestDeliveryOptions {
  orderId: string;
  address?: string;
  scheduledDate?: Date;
  courierName?: string;
  trackingNumber?: string;
  deliveredAt?: Date;
}

/** Creates a Delivery directly via Prisma, bypassing POST /api/delivery (and its order-state checks), for testing the other endpoints in isolation. */
export const createTestDelivery = async (options: CreateTestDeliveryOptions): Promise<Delivery> => {
  return prisma.delivery.create({
    data: {
      orderId: options.orderId,
      address: options.address ?? '123 Test Street, Test City, Test Province, 1234',
      scheduledDate: options.scheduledDate ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      courierName: options.courierName,
      trackingNumber: options.trackingNumber,
      deliveredAt: options.deliveredAt,
    },
  });
};
