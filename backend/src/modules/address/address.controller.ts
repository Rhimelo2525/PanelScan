import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { suggestAddressForPin } from './address.geocoding';
import { AddressService, addressService } from './address.service';

const requireCustomerId = (req: Request): string => {
  if (!req.user) {
    throw new AppError('Authentication required.', 401);
  }
  return req.user.id;
};

export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  list = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const addresses = await this.addressService.listAddresses(requireCustomerId(req));
    sendSuccess(res, 200, 'Addresses retrieved successfully.', { addresses });
  });

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const address = await this.addressService.createAddress(requireCustomerId(req), req.body);
    sendSuccess(res, 201, 'Address saved successfully.', { address });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const address = await this.addressService.updateAddress(req.params.id as string, requireCustomerId(req), req.body);
    sendSuccess(res, 200, 'Address updated successfully.', { address });
  });

  setDefault = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const address = await this.addressService.setDefaultAddress(req.params.id as string, requireCustomerId(req));
    sendSuccess(res, 200, 'Default address updated.', { address });
  });

  remove = catchAsync(async (req: Request, res: Response): Promise<void> => {
    await this.addressService.deleteAddress(req.params.id as string, requireCustomerId(req));
    sendSuccess(res, 200, 'Address deleted successfully.');
  });

  /** Query values were validated (and range-checked) by reverseGeocodeSchema; they arrive as strings. */
  reverseGeocode = catchAsync(async (req: Request, res: Response): Promise<void> => {
    requireCustomerId(req);
    const suggestion = await suggestAddressForPin(Number(req.query.latitude), Number(req.query.longitude));
    sendSuccess(res, 200, 'Address lookup complete.', { suggestion });
  });
}

export const addressController = new AddressController(addressService);
