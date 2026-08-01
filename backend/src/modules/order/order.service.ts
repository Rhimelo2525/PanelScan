import { OrderStatus, Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import type { CreateOrderInput } from './order.validation';
import { orderInclude } from './order.types';
import type { OrderFilters, OrderWithItems, PaginatedOrders } from './order.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([OrderStatus.DELIVERED, OrderStatus.CANCELLED]);

const generateOrderNumber = (): string => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PS-${datePart}-${randomPart}`;
};

interface OrderItemDraft {
  productId: string;
  productName: string;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
}

/**
 * Restores the ordered quantity of every item back to Inventory. Shared by
 * the CUSTOMER cancel-while-PENDING path and the MODERATOR/OWNER
 * set-status-to-CANCELLED path, so stock is returned identically no matter
 * who cancels.
 */
const restockOrderItems = async (tx: Prisma.TransactionClient, orderId: string): Promise<void> => {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    await tx.inventory.update({
      where: { productId: item.productId },
      data: { quantity: { increment: item.quantity } },
    });
  }
};

export class OrderService {
  /**
   * Converts the customer's current cart into an Order. Everything below
   * (re-validating each item, creating the order + items, decrementing
   * inventory, clearing the cart) runs inside one transaction: if any item
   * fails availability, nothing is committed - no order, no stock change,
   * no cleared cart. CockroachDB's default SERIALIZABLE isolation protects
   * the inventory reads/writes here from racing a concurrent checkout or
   * inventory adjustment for the same product.
   */
  async createOrderFromCart(customerId: string, input: CreateOrderInput): Promise<OrderWithItems> {
    return prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { customerId },
        include: { items: { include: { product: { include: { inventory: true } } } } },
      });

      if (!cart || cart.items.length === 0) {
        throw new AppError('Your cart is empty.', 400);
      }

      let subtotal = new Prisma.Decimal(0);
      const orderItemsData: OrderItemDraft[] = [];

      for (const cartItem of cart.items) {
        const { product } = cartItem;

        if (product.deletedAt || !product.isActive) {
          throw new AppError(`"${product.name}" is no longer available and cannot be ordered.`, 400);
        }

        const available = product.inventory ? product.inventory.quantity - product.inventory.reservedQty : 0;
        if (cartItem.quantity > available) {
          throw new AppError(`Only ${available} unit(s) of "${product.name}" are available.`, 400);
        }

        const lineTotal = product.price.mul(cartItem.quantity);
        subtotal = subtotal.add(lineTotal);

        orderItemsData.push({
          productId: product.id,
          productName: product.name,
          unitPrice: product.price,
          quantity: cartItem.quantity,
          lineTotal,
        });
      }

      const shippingFee = new Prisma.Decimal(0);
      const totalAmount = subtotal.add(shippingFee);

      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId,
          status: OrderStatus.PENDING,
          subtotal,
          shippingFee,
          totalAmount,
          shippingAddress: input.shippingAddress,
          notes: input.notes,
          items: { createMany: { data: orderItemsData } },
        },
      });

      for (const cartItem of cart.items) {
        await tx.inventory.update({
          where: { productId: cartItem.productId },
          data: { quantity: { decrement: cartItem.quantity } },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    });
  }

  /** CUSTOMER's own orders. */
  async getOrders(customerId: string, filters: OrderFilters): Promise<PaginatedOrders> {
    return this.listOrders({ ...filters, customerId });
  }

  /** MODERATOR/OWNER view of every order. */
  async getAllOrders(filters: OrderFilters): Promise<PaginatedOrders> {
    return this.listOrders(filters);
  }

  private async listOrders(filters: OrderFilters & { customerId?: string }): Promise<PaginatedOrders> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const where: Prisma.OrderWhereInput = {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return { orders, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getOrderById(orderId: string, requesterId: string, requesterRole: UserRole): Promise<OrderWithItems> {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    if (requesterRole === UserRole.CUSTOMER && order.customerId !== requesterId) {
      throw new AppError('Order not found.', 404);
    }

    return order;
  }

  async cancelOwnOrder(orderId: string, customerId: string): Promise<OrderWithItems> {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.customerId !== customerId) {
        throw new AppError('Order not found.', 404);
      }
      if (order.status !== OrderStatus.PENDING) {
        throw new AppError('Only pending orders can be cancelled.', 400);
      }

      await restockOrderItems(tx, orderId);
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<OrderWithItems> {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new AppError('Order not found.', 404);
      }
      if (TERMINAL_STATUSES.has(order.status)) {
        throw new AppError(
          `This order is already ${order.status.toLowerCase()} and its status can no longer be changed.`,
          400,
        );
      }

      if (status === OrderStatus.CANCELLED) {
        await restockOrderItems(tx, orderId);
      }

      await tx.order.update({ where: { id: orderId }, data: { status } });

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }
}

export const orderService = new OrderService();
