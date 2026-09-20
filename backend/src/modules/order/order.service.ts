import { BookingStatus, NotificationType, OrderStatus, Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { AppError } from '../../utils/AppError';
import type { CreateOrderInput } from './order.validation';
import { orderInclude } from './order.types';
import type { OrderFilters, OrderWithItems, PaginatedOrders } from './order.types';
import { validatePsgcHierarchy } from '../delivery/data/psgc-luzon.data.js';
import { isLocationInPanelScanCoverage } from '../delivery/delivery-coverage.config.js';
import { formatPhilippineDeliveryAddress } from '../delivery/utils/address-formatter.js';
import { normalizePhilippinePhone } from '../delivery/utils/phone-normalizer.js';

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
      let subtotal = new Prisma.Decimal(0);
      const orderItemsData: OrderItemDraft[] = [];
      const inventoryDecrements: { productId: string; quantity: number }[] = [];
      const cartItemIdsToDelete: string[] = [];
      let cartIdForDeletion: string | null = null;

      if (input.directItem) {
        const product = await tx.product.findUnique({
          where: { id: input.directItem.productId },
          include: { inventory: true },
        });

        if (!product || product.deletedAt || !product.isActive) {
          throw new AppError('The selected product is no longer available and cannot be ordered.', 400);
        }

        const available = product.inventory ? product.inventory.quantity - product.inventory.reservedQty : 0;
        if (input.directItem.quantity > available) {
          throw new AppError('The selected product has limited availability. Please update your quantity before checkout.', 400);
        }

        const lineTotal = product.price.mul(input.directItem.quantity);
        subtotal = lineTotal;

        orderItemsData.push({
          productId: product.id,
          productName: product.name,
          unitPrice: product.price,
          quantity: input.directItem.quantity,
          lineTotal,
        });

        inventoryDecrements.push({
          productId: product.id,
          quantity: input.directItem.quantity,
        });
      } else {
        const cart = await tx.cart.findUnique({
          where: { customerId },
          include: { items: { include: { product: { include: { inventory: true } } } } },
        });

        if (!cart || cart.items.length === 0) {
          throw new AppError('Your cart is empty.', 400);
        }

        let itemsToCheckout = cart.items;
        if (input.selectedItemIds && input.selectedItemIds.length > 0) {
          itemsToCheckout = itemsToCheckout.filter((item) => input.selectedItemIds!.includes(item.id));
        }
        if (input.selectedProductIds && input.selectedProductIds.length > 0) {
          itemsToCheckout = itemsToCheckout.filter((item) => input.selectedProductIds!.includes(item.productId));
        }

        if (itemsToCheckout.length === 0) {
          throw new AppError('No selected items found in your cart.', 400);
        }

        cartIdForDeletion = cart.id;
        for (const cartItem of itemsToCheckout) {
          const { product } = cartItem;

          if (product.deletedAt || !product.isActive) {
            throw new AppError(`"${product.name}" is no longer available and cannot be ordered.`, 400);
          }

          const available = product.inventory ? product.inventory.quantity - product.inventory.reservedQty : 0;
          if (cartItem.quantity > available) {
            throw new AppError('Some items in your cart have limited availability. Please update your quantity before checkout.', 400);
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

          inventoryDecrements.push({
            productId: cartItem.productId,
            quantity: cartItem.quantity,
          });
          cartItemIdsToDelete.push(cartItem.id);
        }
      }

      const shippingFee = new Prisma.Decimal(0);
      const totalAmount = subtotal.add(shippingFee);

      let finalShippingAddress = input.shippingAddress || '';
      let deliveryLocationSnapshot: Prisma.InputJsonValue | undefined = undefined;

      if (input.deliveryLocation) {
        const { regionCode, provinceCode, cityMunicipalityCode, barangayCode } = input.deliveryLocation;

        // 1. Validate PSGC Hierarchy
        const hierarchyCheck = validatePsgcHierarchy({
          regionCode,
          provinceCode: provinceCode ?? null,
          cityMunicipalityCode,
          barangayCode,
        });

        if (!hierarchyCheck.isValid) {
          throw new AppError(hierarchyCheck.error || 'Invalid delivery location hierarchy.', 400);
        }

        // 2. Validate preliminary coverage
        if (!isLocationInPanelScanCoverage(regionCode, provinceCode)) {
          throw new AppError('The selected location is outside PanelScan preliminary delivery coverage.', 400);
        }

        // 3. Format address via canonical single formatter
        const formatted = formatPhilippineDeliveryAddress(input.deliveryLocation);
        finalShippingAddress = formatted;

        // 4. Normalize phone if present
        const normalizedPhone = input.deliveryLocation.recipientPhone
          ? normalizePhilippinePhone(input.deliveryLocation.recipientPhone)
          : undefined;

        // 5. Build snapshot (coordinates strictly null until authorized geocoder runs in Lalamove phase)
        deliveryLocationSnapshot = {
          ...input.deliveryLocation,
          formattedAddress: formatted,
          recipientPhone: normalizedPhone || input.deliveryLocation.recipientPhone,
          latitude: null,
          longitude: null,
          geocodingStatus: 'pending',
        } as unknown as Prisma.InputJsonValue;
      }

      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId,
          status: OrderStatus.PENDING,
          subtotal,
          shippingFee,
          totalAmount,
          shippingAddress: finalShippingAddress,
          deliveryLocation: deliveryLocationSnapshot ?? Prisma.JsonNull,
          notes: input.notes,
          items: { createMany: { data: orderItemsData } },
        },
      });

      for (const item of inventoryDecrements) {
        await tx.inventory.update({
          where: { productId: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      if (cartIdForDeletion && cartItemIdsToDelete.length > 0) {
        await tx.cartItem.deleteMany({
          where: {
            cartId: cartIdForDeletion,
            id: { in: cartItemIdsToDelete },
          },
        });
      }

      await createNotification(
        {
          userId: customerId,
          type: NotificationType.ORDER,
          title: 'Order placed',
          message: `Your order ${order.orderNumber} has been placed successfully.`,
          metadata: { orderId: order.id, orderNumber: order.orderNumber },
        },
        tx,
      );

      if (input.installation) {
        await tx.booking.create({
          data: {
            customerId,
            orderId: order.id,
            scheduledDate: input.installation.scheduledDate,
            address: input.installation.address,
            notes: input.installation.notes,
            status: BookingStatus.PENDING,
          },
        });

        await createNotification(
          {
            userId: customerId,
            type: NotificationType.BOOKING,
            title: 'Installation requested',
            message: `Installation for order ${order.orderNumber} was requested and is pending confirmation.`,
            metadata: { orderId: order.id, orderNumber: order.orderNumber },
          },
          tx,
        );
      }

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

      await createNotification(
        {
          userId: order.customerId,
          type: NotificationType.ORDER,
          title: 'Order status updated',
          message: `Your order ${order.orderNumber} is now cancelled.`,
          metadata: { orderId: order.id, orderNumber: order.orderNumber, status: OrderStatus.CANCELLED },
        },
        tx,
      );

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

      await createNotification(
        {
          userId: order.customerId,
          type: NotificationType.ORDER,
          title: 'Order status updated',
          message: `Your order ${order.orderNumber} is now ${status.toLowerCase()}.`,
          metadata: { orderId: order.id, orderNumber: order.orderNumber, status },
        },
        tx,
      );

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }

  async approveOrder(orderId: string, _moderatorId: string): Promise<OrderWithItems> {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new AppError('Order not found.', 404);
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new AppError('Cannot approve a cancelled order.', 400);
      }
      if (order.moderatorApproved) {
        return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
      }

      await tx.order.update({
        where: { id: orderId },
        data: { moderatorApproved: true },
      });

      await createNotification(
        {
          userId: order.customerId,
          type: NotificationType.ORDER,
          title: 'Order approved',
          message: `Your order ${order.orderNumber} has been approved. You can now proceed with payment.`,
          metadata: { orderId: order.id, orderNumber: order.orderNumber, event: 'ORDER_APPROVED' },
        },
        tx,
      );

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }
}

export const orderService = new OrderService();
