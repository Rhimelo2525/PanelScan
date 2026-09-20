import { BookingStatus, NotificationType, OrderStatus, Prisma, ProjectSource, ProjectStatus, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { AppError } from '../../utils/AppError';
import { bookingInclude } from './booking.types';
import type { BookingFilters, BookingWithRelations, PaginatedBookings } from './booking.types';
import type { CreateBookingInput } from './booking.validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * SCHEDULED is deliberately unreachable from APPROVED here - it only ever
 * happens as a side effect of assignInstaller(), since a "scheduled"
 * booking with no installer attached wouldn't make operational sense.
 * MODERATOR can additionally cancel from PENDING/APPROVED/SCHEDULED (a
 * broader cancellation right than the customer's own PENDING-only cancel).
 */
const ALLOWED_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.APPROVED, BookingStatus.SCHEDULED, BookingStatus.CANCELLED],
  [BookingStatus.APPROVED]: [BookingStatus.SCHEDULED, BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.SCHEDULED]: [BookingStatus.APPROVED, BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
};

export class BookingService {
  async createBooking(customerId: string, input: CreateBookingInput): Promise<BookingWithRelations> {
    // 1. Verify customer has at least one valid completed/checked-out order
    const qualifyingOrders = await prisma.order.findMany({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELLED },
      },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });

    if (qualifyingOrders.length === 0) {
      throw new AppError('You need to complete an order before requesting installation.', 400);
    }

    let linkedOrderId: string | undefined = undefined;
    if (input.orderId) {
      const match = qualifyingOrders.find((o) => o.id === input.orderId);
      if (!match) {
        throw new AppError('You need to complete an order before requesting installation.', 400);
      }
      if (!match.booking) {
        linkedOrderId = match.id;
      }
    } else {
      const unbookedOrder = qualifyingOrders.find((o) => !o.booking);
      if (unbookedOrder) {
        linkedOrderId = unbookedOrder.id;
      }
    }

    const booking = await prisma.booking.create({
      data: {
        customerId,
        orderId: linkedOrderId,
        scheduledDate: input.scheduledDate,
        address: input.address,
        notes: input.notes,
        status: BookingStatus.PENDING,
      },
      include: bookingInclude,
    });

    await createNotification({
      userId: customerId,
      type: NotificationType.BOOKING,
      title: 'Booking created',
      message: `Your booking for ${booking.address} has been submitted and is pending approval.`,
      metadata: { bookingId: booking.id },
    });

    return booking;
  }

  /** CUSTOMER's own bookings. */
  async getMyBookings(customerId: string, filters: BookingFilters): Promise<PaginatedBookings> {
    return this.listBookings({ ...filters, customerId });
  }

  /** MODERATOR/OWNER view of every booking. */
  async getAllBookings(filters: BookingFilters): Promise<PaginatedBookings> {
    return this.listBookings(filters);
  }

  private async listBookings(filters: BookingFilters & { customerId?: string }): Promise<PaginatedBookings> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const where: Prisma.BookingWhereInput = {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.onlyOrders ? { orderId: { not: null } } : {}),
    };

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);

    return { bookings, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getBookingById(bookingId: string, requesterId: string, requesterRole: UserRole): Promise<BookingWithRelations> {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
    if (!booking) {
      throw new AppError('Booking not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && booking.customerId !== requesterId) {
      throw new AppError('Booking not found.', 404);
    }
    return booking;
  }

  async cancelOwnBooking(bookingId: string, customerId: string): Promise<BookingWithRelations> {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.customerId !== customerId) {
      throw new AppError('Booking not found.', 404);
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new AppError('Only pending bookings can be cancelled.', 400);
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED },
      include: bookingInclude,
    });

    await createNotification({
      userId: customerId,
      type: NotificationType.BOOKING,
      title: 'Booking cancelled',
      message: `Your booking for ${booking.address} has been cancelled.`,
      metadata: { bookingId: booking.id, status: BookingStatus.CANCELLED },
    });

    return updated;
  }

  async updateBookingStatus(
    bookingId: string,
    actingUserId: string,
    newStatus: BookingStatus,
    scheduledDate?: Date,
  ): Promise<BookingWithRelations> {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        throw new AppError('Booking not found.', 404);
      }

      if (booking.status !== newStatus) {
        const allowedNext = ALLOWED_STATUS_TRANSITIONS[booking.status];
        if (!allowedNext.includes(newStatus)) {
          throw new AppError(`Cannot change booking status from ${booking.status} to ${newStatus}.`, 400);
        }
      }

      const updateData: Prisma.BookingUpdateInput = {
        status: newStatus,
        ...(scheduledDate ? { scheduledDate } : {}),
      };

      await tx.booking.update({ where: { id: bookingId }, data: updateData });

      if (newStatus === BookingStatus.APPROVED || newStatus === BookingStatus.CANCELLED) {
        await createNotification(
          {
            userId: booking.customerId,
            type: NotificationType.BOOKING,
            title: newStatus === BookingStatus.APPROVED ? 'Booking approved' : 'Booking cancelled',
            message:
              newStatus === BookingStatus.APPROVED
                ? `Your booking for ${booking.address} has been approved.`
                : `Your booking for ${booking.address} has been cancelled.`,
            metadata: { bookingId: booking.id, status: newStatus },
          },
          tx,
        );
      }

      if (newStatus === BookingStatus.COMPLETED) {
        await this.syncProjectOnBookingCompleted(tx, booking, actingUserId);
      }

      return tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude });
    });
  }

  async assignInstaller(bookingId: string, installerId: string): Promise<BookingWithRelations> {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        throw new AppError('Booking not found.', 404);
      }
      if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) {
        throw new AppError('Cannot assign an installer to a completed or cancelled booking.', 400);
      }

      const installer = await tx.installer.findUnique({ where: { id: installerId } });
      if (!installer) {
        throw new AppError('Installer not found.', 404);
      }
      if (!installer.isActive) {
        throw new AppError('Cannot assign an inactive installer.', 400);
      }

      const nextStatus =
        booking.status === BookingStatus.PENDING || booking.status === BookingStatus.APPROVED
          ? BookingStatus.SCHEDULED
          : booking.status;

      await tx.booking.update({
        where: { id: bookingId },
        data: { installerId, status: nextStatus },
      });

      return tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude });
    });
  }

  private async syncProjectOnBookingCompleted(
    tx: Prisma.TransactionClient,
    booking: { customerId: string; address: string; createdAt: Date },
    moderatorId: string,
  ): Promise<void> {
    const existingProject = await tx.project.findFirst({
      where: { customerId: booking.customerId, status: ProjectStatus.IN_PROGRESS },
      orderBy: { createdAt: 'desc' },
    });

    if (existingProject) {
      await tx.project.update({
        where: { id: existingProject.id },
        data: { status: ProjectStatus.COMPLETED, endDate: new Date() },
      });

      await createNotification(
        {
          userId: booking.customerId,
          type: NotificationType.SYSTEM,
          title: 'Project updated',
          message: `Your project "${existingProject.name}" has been completed.`,
          metadata: { projectId: existingProject.id, event: 'PROJECT_UPDATED' },
        },
        tx,
      );
      return;
    }

    const project = await tx.project.create({
      data: {
        customerId: booking.customerId,
        moderatorId,
        name: `Installation - ${booking.address}`,
        status: ProjectStatus.COMPLETED,
        source: ProjectSource.MANUAL,
        startDate: booking.createdAt,
        endDate: new Date(),
      },
    });

    await createNotification(
      {
        userId: booking.customerId,
        type: NotificationType.SYSTEM,
        title: 'Project updated',
        message: `Your project "${project.name}" has been completed.`,
        metadata: { projectId: project.id, event: 'PROJECT_UPDATED' },
      },
      tx,
    );
  }
}

export const bookingService = new BookingService();
