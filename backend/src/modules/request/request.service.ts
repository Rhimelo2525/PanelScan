import { NotificationType, Prisma, RequestStatus, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import type { NotificationDbClient } from '../notifications/notification.types';
import { AppError } from '../../utils/AppError';
import { slugify } from '../../utils/slugify';
import { parseDescription, requestInclude, serializeDescription } from './request.types';
import type { ChangeRequestPayload, PaginatedRequests, RequestFilters, RequestWithRelations } from './request.types';
import type { CreateRequestInput, UpdateRequestInput } from './request.validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const humanizeType = (type: string): string => type.replace(/_/g, ' ').toLowerCase();

const buildOrderBy = (
  sortBy: RequestFilters['sortBy'],
  sortOrder: RequestFilters['sortOrder'],
): Prisma.RequestOrderByWithRelationInput => {
  const direction = sortOrder ?? 'desc';
  if (sortBy === 'title') return { title: direction };
  if (sortBy === 'reviewedAt') return { reviewedAt: direction };
  return { createdAt: direction };
};

export class RequestService {
  async createRequest(requestedById: string, input: CreateRequestInput): Promise<RequestWithRelations> {
    const request = await prisma.request.create({
      data: {
        requestedById,
        type: input.type,
        title: input.title,
        description: input.description,
        status: RequestStatus.PENDING,
      },
      include: requestInclude,
    });

    await this.notifyOwners({
      title: 'New request submitted',
      message: `A new ${humanizeType(request.type)} request "${request.title}" needs your review.`,
      metadata: { requestId: request.id, event: 'REQUEST_SUBMITTED', status: request.status, requestType: request.type },
    });

    return request;
  }

  /** MODERATOR: own requests only. */
  async getMyRequests(requestedById: string, filters: RequestFilters): Promise<PaginatedRequests> {
    return this.listRequests({ ...filters, requestedById });
  }

  /** OWNER: every request. */
  async getAllRequests(filters: RequestFilters): Promise<PaginatedRequests> {
    return this.listRequests(filters);
  }

  private async listRequests(filters: RequestFilters): Promise<PaginatedRequests> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const where: Prisma.RequestWhereInput = {
      ...(filters.requestedById ? { requestedById: filters.requestedById } : {}),
      ...(filters.reviewedById ? { reviewedById: filters.reviewedById } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.search ? { title: { contains: filters.search, mode: 'insensitive' } } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
    };

    const [requests, total] = await Promise.all([
      prisma.request.findMany({
        where,
        include: requestInclude,
        orderBy: buildOrderBy(filters.sortBy, filters.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.request.count({ where }),
    ]);

    return { requests, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getRequestById(requestId: string, requesterId: string, requesterRole: UserRole): Promise<RequestWithRelations> {
    const request = await prisma.request.findUnique({ where: { id: requestId }, include: requestInclude });
    if (!request) {
      throw new AppError('Request not found.', 404);
    }
    if (requesterRole === UserRole.MODERATOR && request.requestedById !== requesterId) {
      throw new AppError('Request not found.', 404);
    }
    return request;
  }

  /**
   * MODERATOR-only, own request, and only while still PENDING - once
   * reviewed or cancelled, the record is history. A change request's
   * `description` column can carry a structured payload appended after
   * `CHANGE_PAYLOAD_DELIMITER` (see request.types.ts) that approveRequest()
   * later reads to actually apply the change - so an edit here re-serializes
   * the new summary against that existing payload instead of overwriting the
   * whole column with plain text, which would silently strip the payload and
   * turn a future "Approve" into a no-op.
   */
  async updateOwnRequest(requestId: string, moderatorId: string, input: UpdateRequestInput): Promise<RequestWithRelations> {
    const existing = await prisma.request.findUnique({ where: { id: requestId } });
    if (!existing || existing.requestedById !== moderatorId) {
      throw new AppError('Request not found.', 404);
    }
    if (existing.status !== RequestStatus.PENDING) {
      throw new AppError(`Cannot edit a request that is already ${existing.status.toLowerCase()}.`, 409);
    }

    let nextDescription = input.description;
    if (input.description !== undefined) {
      const { payload } = parseDescription(existing.description);
      if (payload) {
        nextDescription = serializeDescription(input.description, payload);
      }
    }

    return prisma.request.update({
      where: { id: requestId },
      data: { type: input.type, title: input.title, description: nextDescription },
      include: requestInclude,
    });
  }

  async approveRequest(requestId: string, ownerId: string, reviewNote: string | undefined): Promise<RequestWithRelations> {
    return prisma.$transaction(async (tx) => {
      const request = await tx.request.findUnique({ where: { id: requestId } });
      if (!request) {
        throw new AppError('Request not found.', 404);
      }
      if (request.status !== RequestStatus.PENDING) {
        throw new AppError(`Cannot approve a request that is already ${request.status.toLowerCase()}.`, 409);
      }

      const { payload } = parseDescription(request.description);
      if (payload) {
        await this.applyApprovedChange(tx, payload);
      }

      const updated = await tx.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.APPROVED, reviewedById: ownerId, reviewedAt: new Date(), reviewNote },
        include: requestInclude,
      });

      await createNotification(
        {
          userId: request.requestedById,
          type: NotificationType.SYSTEM,
          title: 'Request approved',
          message: `Your ${humanizeType(request.type)} request "${request.title}" has been approved.`,
          metadata: { requestId: request.id, event: 'REQUEST_APPROVED', status: RequestStatus.APPROVED, requestType: request.type },
        },
        tx,
      );

      return updated;
    });
  }

  async rejectRequest(requestId: string, ownerId: string, reviewNote: string | undefined): Promise<RequestWithRelations> {
    return prisma.$transaction(async (tx) => {
      const request = await tx.request.findUnique({ where: { id: requestId } });
      if (!request) {
        throw new AppError('Request not found.', 404);
      }
      if (request.status !== RequestStatus.PENDING) {
        throw new AppError(`Cannot reject a request that is already ${request.status.toLowerCase()}.`, 409);
      }

      const updated = await tx.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.REJECTED, reviewedById: ownerId, reviewedAt: new Date(), reviewNote },
        include: requestInclude,
      });

      await createNotification(
        {
          userId: request.requestedById,
          type: NotificationType.SYSTEM,
          title: 'Request rejected',
          message: `Your ${humanizeType(request.type)} request "${request.title}" has been rejected.`,
          metadata: { requestId: request.id, event: 'REQUEST_REJECTED', status: RequestStatus.REJECTED, requestType: request.type },
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * MODERATOR-only, own PENDING request. Deliberately never touches
   * reviewedById/reviewedAt/reviewNote - those stay null, so a cancelled
   * request can never be mistaken for one an OWNER actually reviewed.
   */
  async cancelOwnRequest(requestId: string, moderatorId: string): Promise<RequestWithRelations> {
    return prisma.$transaction(async (tx) => {
      const request = await tx.request.findUnique({ where: { id: requestId } });
      if (!request || request.requestedById !== moderatorId) {
        throw new AppError('Request not found.', 404);
      }
      if (request.status !== RequestStatus.PENDING) {
        throw new AppError(`Cannot cancel a request that is already ${request.status.toLowerCase()}.`, 409);
      }

      const updated = await tx.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.CANCELLED },
        include: requestInclude,
      });

      await this.notifyOwners(
        {
          title: 'Request cancelled',
          message: `A ${humanizeType(request.type)} request "${request.title}" was cancelled by its submitter.`,
          metadata: { requestId: request.id, event: 'REQUEST_CANCELLED', status: RequestStatus.CANCELLED, requestType: request.type },
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * OWNER: any request, any status. MODERATOR: only their own, and only if
   * it was never reviewed (PENDING or CANCELLED) - preserves the OWNER's
   * APPROVED/REJECTED decisions as an untouchable audit trail.
   */
  async deleteRequest(requestId: string, requesterId: string, requesterRole: UserRole): Promise<void> {
    const existing = await prisma.request.findUnique({ where: { id: requestId } });
    if (!existing) {
      throw new AppError('Request not found.', 404);
    }

    if (requesterRole === UserRole.MODERATOR) {
      if (existing.requestedById !== requesterId) {
        throw new AppError('Request not found.', 404);
      }
      if (existing.status === RequestStatus.APPROVED || existing.status === RequestStatus.REJECTED) {
        throw new AppError('Cannot delete a request that has already been reviewed.', 409);
      }
    }

    await prisma.request.delete({ where: { id: requestId } });
  }

  private async applyApprovedChange(tx: Prisma.TransactionClient, payload: ChangeRequestPayload): Promise<void> {
    if (payload.action === 'ADD_PRODUCT' && payload.productData) {
      const data = payload.productData;
      const category = await tx.category.findUnique({ where: { id: data.categoryId } });
      if (!category) {
        throw new AppError('Product category not found.', 404);
      }

      const trimmedSku = data.sku.trim().toUpperCase();
      const skuConflict = await tx.product.findFirst({
        where: {
          sku: { equals: trimmedSku, mode: 'insensitive' },
          deletedAt: null,
        },
      });
      if (skuConflict) {
        throw new AppError('A product with this SKU already exists.', 409);
      }

      const baseSlug = slugify(data.name);
      let slug = baseSlug;
      let counter = 1;
      while (true) {
        const existing = await tx.product.findUnique({ where: { slug }, select: { id: true } });
        if (!existing) break;
        if (counter === 1) {
          const skuSlug = slugify(trimmedSku);
          slug = skuSlug ? `${baseSlug}-${skuSlug}` : `${baseSlug}-${counter + 1}`;
        } else {
          slug = `${baseSlug}-${counter}`;
        }
        counter++;
      }

      const product = await tx.product.create({
        data: {
          categoryId: data.categoryId,
          name: data.name.trim(),
          slug,
          sku: trimmedSku,
          price: data.price,
          material: data.material?.trim() || null,
          unit: data.unit?.trim() || 'panel',
          width: data.width ? Number(data.width) : null,
          height: data.height ? Number(data.height) : null,
          thickness: data.thickness ? Number(data.thickness) : null,
          description: data.description?.trim() || null,
          isActive: data.isActive ?? true,
          isFeatured: data.isFeatured ?? false,
        },
      });

      if (data.images && Array.isArray(data.images) && data.images.length > 0) {
        await tx.productImage.createMany({
          data: data.images.map((img: any, idx: number) => ({
            productId: product.id,
            url: img.url,
            altText: img.altText || product.name,
            isPrimary: img.isPrimary ?? idx === 0,
            sortOrder: img.sortOrder ?? idx,
          })),
        });
      }
    } else if (payload.action === 'EDIT_PRODUCT' && payload.productId && payload.updateData) {
      const productId = payload.productId;
      const existing = await tx.product.findFirst({ where: { id: productId, deletedAt: null } });
      if (!existing) {
        throw new AppError('Product not found or has been deleted.', 404);
      }

      const { name, categoryId, sku, price, material, unit, width, height, thickness, isActive, isFeatured, description, images } = payload.updateData;

      if (sku) {
        const trimmedSku = sku.trim().toUpperCase();
        const conflict = await tx.product.findFirst({
          where: {
            id: { not: productId },
            sku: { equals: trimmedSku, mode: 'insensitive' },
            deletedAt: null,
          },
        });
        if (conflict) {
          throw new AppError('A product with this SKU already exists.', 409);
        }
      }

      const scalarFields: any = {};
      if (name) {
        scalarFields.name = name.trim();
        scalarFields.slug = slugify(name);
      }
      if (categoryId) scalarFields.categoryId = categoryId;
      if (sku) scalarFields.sku = sku.trim().toUpperCase();
      if (price !== undefined) scalarFields.price = price;
      if (material !== undefined) scalarFields.material = material?.trim() || null;
      if (unit !== undefined) scalarFields.unit = unit?.trim() || 'panel';
      if (width !== undefined) scalarFields.width = width ? Number(width) : null;
      if (height !== undefined) scalarFields.height = height ? Number(height) : null;
      if (thickness !== undefined) scalarFields.thickness = thickness ? Number(thickness) : null;
      if (isActive !== undefined) scalarFields.isActive = isActive;
      if (isFeatured !== undefined) scalarFields.isFeatured = isFeatured;
      if (description !== undefined) scalarFields.description = description?.trim() || null;

      if (images) {
        await tx.productImage.deleteMany({ where: { productId } });
        if (Array.isArray(images) && images.length > 0) {
          await tx.productImage.createMany({
            data: images.map((img: any, idx: number) => ({
              productId,
              url: img.url,
              altText: img.altText || existing.name,
              isPrimary: img.isPrimary ?? idx === 0,
              sortOrder: img.sortOrder ?? idx,
            })),
          });
        }
      }

      await tx.product.update({
        where: { id: productId },
        data: scalarFields,
      });
    } else if (payload.action === 'DELETE_PRODUCT' && payload.productId) {
      const productId = payload.productId;
      const existing = await tx.product.findFirst({ where: { id: productId, deletedAt: null } });
      if (!existing) {
        throw new AppError('Product not found or has already been deleted.', 404);
      }
      const timestamp = Date.now();
      await tx.product.update({
        where: { id: productId },
        data: {
          deletedAt: new Date(),
          isActive: false,
          sku: `${existing.sku}__ARCHIVED_${timestamp}`,
          slug: `${existing.slug}__archived_${timestamp}`,
        },
      });
    } else if (payload.action === 'ADJUST_STOCK' && payload.productId && payload.adjustData) {
      const productId = payload.productId;
      const inventory = await tx.inventory.findUnique({ where: { productId } });
      if (!inventory) {
        throw new AppError('Inventory record not found for this product. Use Record Stock for initial physical stock.', 404);
      }
      if (payload.adjustData.targetQuantity !== undefined) {
        const target = payload.adjustData.targetQuantity;
        if (target < inventory.reservedQty) {
          throw new AppError(`Cannot reduce stock below reserved quantity (${inventory.reservedQty}).`, 400);
        }
        await tx.inventory.update({
          where: { productId },
          data: {
            quantity: target,
            lastRestockedAt: target > inventory.quantity ? new Date() : undefined,
          },
        });
      } else if (payload.adjustData.direction === 'add' && payload.adjustData.quantity !== undefined) {
        await tx.inventory.update({
          where: { productId },
          data: { quantity: { increment: payload.adjustData.quantity }, lastRestockedAt: new Date() },
        });
      } else if (payload.adjustData.direction === 'reduce' && payload.adjustData.quantity !== undefined) {
        if (inventory.quantity - inventory.reservedQty < payload.adjustData.quantity) {
          throw new AppError('Cannot reduce stock below reserved quantity.', 400);
        }
        await tx.inventory.update({
          where: { productId },
          data: { quantity: { decrement: payload.adjustData.quantity } },
        });
      }
    } else if (payload.action === 'ADD_INVENTORY' && payload.productData) {
      const { productId, quantity, reorderLevel, warehouseLocation } = payload.productData;
      const existing = await tx.inventory.findUnique({ where: { productId } });
      if (existing) {
        throw new AppError('Product already has an inventory record. Use Adjust instead.', 409);
      }
      await tx.inventory.create({
        data: {
          productId,
          quantity: Number(quantity),
          reservedQty: 0,
          reorderLevel: reorderLevel ? Number(reorderLevel) : 10,
          warehouseLocation: warehouseLocation || 'Main Warehouse',
          lastRestockedAt: new Date(),
        },
      });
    } else if (payload.action === 'DELETE_INVENTORY' && payload.productId) {
      await tx.inventory.deleteMany({
        where: { productId: payload.productId },
      });
    }
  }

  private async notifyOwners(
    params: { title: string; message: string; metadata: Prisma.InputJsonValue },
    client: NotificationDbClient = prisma,
  ): Promise<void> {
    const owners = await client.user.findMany({ where: { role: UserRole.OWNER, isActive: true }, select: { id: true } });

    await Promise.all(
      owners.map((owner) =>
        createNotification(
          { userId: owner.id, type: NotificationType.SYSTEM, title: params.title, message: params.message, metadata: params.metadata },
          client,
        ),
      ),
    );
  }
}

export const requestService = new RequestService();
