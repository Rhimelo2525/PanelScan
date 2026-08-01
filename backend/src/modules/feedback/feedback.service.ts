import { NotificationType, OrderStatus, Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { AppError } from '../../utils/AppError';
import { feedbackInclude } from './feedback.types';
import type { FeedbackFilters, FeedbackWithRelations, PaginatedFeedback } from './feedback.types';
import type { CreateFeedbackInput, UpdateFeedbackInput } from './feedback.validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export class FeedbackService {
  /**
   * Only DELIVERED orders count as "completed" (OrderStatus has no separate
   * COMPLETED value). Duplicate prevention is app-enforced here rather than
   * a DB unique constraint - the schema has no @@unique([customerId,
   * orderId]) on Feedback, and adding one was out of scope for a task
   * scoped to "Build ONLY the Feedback module."
   */
  async createFeedback(customerId: string, input: CreateFeedbackInput): Promise<FeedbackWithRelations> {
    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order || order.customerId !== customerId) {
      throw new AppError('Order not found.', 404);
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new AppError('Feedback can only be submitted for completed (delivered) orders.', 400);
    }

    const existing = await prisma.feedback.findFirst({ where: { customerId, orderId: input.orderId } });
    if (existing) {
      throw new AppError('You have already submitted feedback for this order.', 400);
    }

    const feedback = await prisma.feedback.create({
      data: {
        customerId,
        orderId: input.orderId,
        rating: input.rating,
        comment: input.comment,
      },
      include: feedbackInclude,
    });

    await this.notifyStaffOfNewFeedback(feedback);

    return feedback;
  }

  /** CUSTOMER's own feedback. */
  async getMyFeedback(customerId: string, filters: FeedbackFilters): Promise<PaginatedFeedback> {
    return this.listFeedback({ ...filters, customerId });
  }

  /** MODERATOR/OWNER view of every feedback entry, with search/filter. */
  async getAllFeedback(filters: FeedbackFilters): Promise<PaginatedFeedback> {
    return this.listFeedback(filters);
  }

  /** Product reviews - Feedback has no direct productId column, so this joins through Order -> OrderItem. */
  async getFeedbackByProduct(productId: string, filters: FeedbackFilters): Promise<PaginatedFeedback> {
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) {
      throw new AppError('Product not found.', 404);
    }
    return this.listFeedback({ ...filters, productId });
  }

  async getFeedbackByOrder(orderId: string, requesterId: string, requesterRole: UserRole): Promise<PaginatedFeedback> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError('Order not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && order.customerId !== requesterId) {
      throw new AppError('Order not found.', 404);
    }
    return this.listFeedback({ orderId });
  }

  private async listFeedback(filters: FeedbackFilters): Promise<PaginatedFeedback> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const sort = filters.sort ?? 'desc';

    const where: Prisma.FeedbackWhereInput = {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.orderId ? { orderId: filters.orderId } : {}),
      ...(filters.rating !== undefined ? { rating: filters.rating } : {}),
      ...(filters.productId ? { order: { items: { some: { productId: filters.productId } } } } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
      ...(filters.search ? { comment: { contains: filters.search, mode: 'insensitive' } } : {}),
    };

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: feedbackInclude,
        orderBy: { createdAt: sort },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.feedback.count({ where }),
    ]);

    return { feedbacks, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getFeedbackById(feedbackId: string, requesterId: string, requesterRole: UserRole): Promise<FeedbackWithRelations> {
    const feedback = await prisma.feedback.findUnique({ where: { id: feedbackId }, include: feedbackInclude });
    if (!feedback) {
      throw new AppError('Feedback not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && feedback.customerId !== requesterId) {
      throw new AppError('Feedback not found.', 404);
    }
    return feedback;
  }

  async updateOwnFeedback(feedbackId: string, customerId: string, input: UpdateFeedbackInput): Promise<FeedbackWithRelations> {
    const existing = await prisma.feedback.findUnique({ where: { id: feedbackId } });
    if (!existing || existing.customerId !== customerId) {
      throw new AppError('Feedback not found.', 404);
    }

    return prisma.feedback.update({
      where: { id: feedbackId },
      data: { rating: input.rating, comment: input.comment },
      include: feedbackInclude,
    });
  }

  async deleteOwnFeedback(feedbackId: string, customerId: string): Promise<void> {
    const existing = await prisma.feedback.findUnique({ where: { id: feedbackId } });
    if (!existing || existing.customerId !== customerId) {
      throw new AppError('Feedback not found.', 404);
    }

    await prisma.feedback.delete({ where: { id: feedbackId } });
  }

  /**
   * NotificationType has no dedicated FEEDBACK value (only ORDER/PAYMENT/
   * BOOKING/CHAT/SYSTEM exist), so SYSTEM is used, disambiguated via
   * metadata.event - same approach already used for the booking-completion
   * -> project-sync notification. Reuses createNotification() from the
   * existing Notification module rather than writing to the Notification
   * table directly, per "do NOT duplicate notification logic."
   */
  private async notifyStaffOfNewFeedback(feedback: FeedbackWithRelations): Promise<void> {
    const staff = await prisma.user.findMany({
      where: { role: { in: [UserRole.MODERATOR, UserRole.OWNER] }, isActive: true },
      select: { id: true },
    });

    await Promise.all(
      staff.map((member) =>
        createNotification({
          userId: member.id,
          type: NotificationType.SYSTEM,
          title: 'New feedback submitted',
          message: `${feedback.customer.firstName} ${feedback.customer.lastName} left a ${feedback.rating}-star review.`,
          metadata: { feedbackId: feedback.id, orderId: feedback.orderId, event: 'FEEDBACK_SUBMITTED' },
        }),
      ),
    );
  }
}

export const feedbackService = new FeedbackService();
