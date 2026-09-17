import { prisma } from '../../src/config/database';

/**
 * Deletes all rows across every model, in dependency order (children before
 * parents), so foreign-key `Restrict` constraints never block cleanup. Runs
 * after every test to keep tests isolated. A single outer transaction can't
 * wrap an HTTP request under test (the app's own route handlers open their
 * own Prisma queries/transactions against the shared connection pool), so
 * isolation comes from truncating between tests instead of rolling back.
 */
export const cleanDatabase = async (): Promise<void> => {
  await prisma.$transaction([
    prisma.refreshToken.deleteMany(),
    prisma.chatParticipant.deleteMany(),
    prisma.message.deleteMany(),
    prisma.chatRoom.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.feedback.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.delivery.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.measurement.deleteMany(),
    prisma.request.deleteMany(),
    prisma.project.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.installer.deleteMany(),
    prisma.user.deleteMany(),
  ]);
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};
