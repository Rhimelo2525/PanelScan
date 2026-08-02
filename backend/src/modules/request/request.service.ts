import { NotificationType, Prisma, RequestStatus, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import type { NotificationDbClient } from '../notifications/notification.types';
import { AppError } from '../../utils/AppError';
import { requestInclude } from './request.types';
import type { PaginatedRequests, RequestFilters, RequestWithRelations } from './request.types';
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

  /** MODERATOR-only, own request, and only while still PENDING - once reviewed or cancelled, the record is history. */
  async updateOwnRequest(requestId: string, moderatorId: string, input: UpdateRequestInput): Promise<RequestWithRelations> {
    const existing = await prisma.request.findUnique({ where: { id: requestId } });
    if (!existing || existing.requestedById !== moderatorId) {
      throw new AppError('Request not found.', 404);
    }
    if (existing.status !== RequestStatus.PENDING) {
      throw new AppError(`Cannot edit a request that is already ${existing.status.toLowerCase()}.`, 409);
    }

    return prisma.request.update({
      where: { id: requestId },
      data: { type: input.type, title: input.title, description: input.description },
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
