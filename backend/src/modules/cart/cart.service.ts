import { Prisma } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import type { AddCartItemInput } from './cart.validation';

const cartInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          price: true,
          unit: true,
          isActive: true,
          deletedAt: true,
          images: { where: { isPrimary: true }, take: 1, select: { url: true } },
          inventory: { select: { quantity: true, reservedQty: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

/**
 * Fetches a product together with its inventory and throws the appropriate
 * AppError if it can't be added to / kept in a cart. Shared by add and
 * update so "reject inactive/deleted products" and "prevent exceeding
 * inventory" are enforced identically in both places.
 */
const getPurchasableProductOrThrow = async (
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<Prisma.ProductGetPayload<{ include: { inventory: true } }>> => {
  const product = await tx.product.findFirst({
    where: { id: productId, deletedAt: null },
    include: { inventory: true },
  });
  if (!product) {
    throw new AppError('Product not found.', 404);
  }
  if (!product.isActive) {
    throw new AppError('This product is currently unavailable.', 400);
  }
  return product;
};

const getAvailableQuantity = (inventory: { quantity: number; reservedQty: number } | null): number => {
  if (!inventory) return 0;
  return inventory.quantity - inventory.reservedQty;
};

export class CartService {
  async getCart(customerId: string): Promise<CartWithItems> {
    return prisma.cart.upsert({
      where: { customerId },
      update: {},
      create: { customerId },
      include: cartInclude,
    });
  }

  async addItem(customerId: string, input: AddCartItemInput): Promise<CartWithItems> {
    return prisma.$transaction(async (tx) => {
      const product = await getPurchasableProductOrThrow(tx, input.productId);
      const available = getAvailableQuantity(product.inventory);
      if (available <= 0) {
        throw new AppError('This product is out of stock.', 400);
      }

      const cart = await tx.cart.upsert({ where: { customerId }, update: {}, create: { customerId } });

      const existingItem = await tx.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: input.productId } },
      });

      const desiredQuantity = (existingItem?.quantity ?? 0) + input.quantity;
      if (desiredQuantity > available) {
        throw new AppError(`Only ${available} unit(s) of this product are available.`, 400);
      }

      if (existingItem) {
        await tx.cartItem.update({ where: { id: existingItem.id }, data: { quantity: desiredQuantity } });
      } else {
        await tx.cartItem.create({ data: { cartId: cart.id, productId: input.productId, quantity: input.quantity } });
      }

      return tx.cart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
    });
  }

  async updateItemQuantity(customerId: string, productId: string, quantity: number): Promise<CartWithItems> {
    return prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { customerId } });
      if (!cart) {
        throw new AppError('Your cart is empty.', 404);
      }

      const item = await tx.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId } } });
      if (!item) {
        throw new AppError('This product is not in your cart.', 404);
      }

      const product = await getPurchasableProductOrThrow(tx, productId);
      const available = getAvailableQuantity(product.inventory);
      if (quantity > available) {
        throw new AppError(`Only ${available} unit(s) of this product are available.`, 400);
      }

      await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });

      return tx.cart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
    });
  }

  async removeItem(customerId: string, productId: string): Promise<CartWithItems> {
    const cart = await prisma.cart.findUnique({ where: { customerId } });
    if (!cart) {
      throw new AppError('Your cart is empty.', 404);
    }

    const item = await prisma.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId } } });
    if (!item) {
      throw new AppError('This product is not in your cart.', 404);
    }

    await prisma.cartItem.delete({ where: { id: item.id } });

    return prisma.cart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
  }

  async clearCart(customerId: string): Promise<CartWithItems> {
    const cart = await prisma.cart.upsert({ where: { customerId }, update: {}, create: { customerId } });

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    return prisma.cart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
  }
}

export const cartService = new CartService();
