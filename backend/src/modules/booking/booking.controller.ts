import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { BookingService, bookingService } from './booking.service';
import type { BookingFilters } from './booking.types';

interface Requester {
  id: string;
  role: UserRole;
}

const getRequester = (req: Request): Requester => {
  if (!req.user) {
    throw new AppError('Authentication required.', 401);
  }
  return { id: req.user.id, role: req.user.role };
};

const parseBookingFilters = (query: Request['query']): BookingFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
  status: typeof query.status === 'string' ? (query.status as BookingFilters['status']) : undefined,
});

export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const booking = await this.bookingService.createBooking(requester.id, req.body);
    sendSuccess(res, 201, 'Booking created successfully.', { booking });
  });

  /** CUSTOMER's own bookings - GET /api/bookings */
  getMyBookings = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const result = await this.bookingService.getMyBookings(requester.id, parseBookingFilters(req.query));
    sendSuccess(res, 200, 'Bookings retrieved successfully.', result);
  });

  /** MODERATOR/OWNER view of every booking - GET /api/bookings/all */
  getAllBookings = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await this.bookingService.getAllBookings(parseBookingFilters(req.query));
    sendSuccess(res, 200, 'Bookings retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const booking = await this.bookingService.getBookingById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Booking retrieved successfully.', { booking });
  });

  cancel = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const booking = await this.bookingService.cancelOwnBooking(req.params.id as string, requester.id);
    sendSuccess(res, 200, 'Booking cancelled successfully.', { booking });
  });

  updateStatus = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const booking = await this.bookingService.updateBookingStatus(req.params.id as string, requester.id, req.body.status);
    sendSuccess(res, 200, 'Booking status updated successfully.', { booking });
  });

  assignInstaller = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const booking = await this.bookingService.assignInstaller(req.params.id as string, req.body.installerId);
    sendSuccess(res, 200, 'Installer assigned successfully.', { booking });
  });
}

export const bookingController = new BookingController(bookingService);
