import type { CustomerAddress, Prisma } from '@prisma/client';

import { getBackupPrisma } from '../../config/backupDatabase';
import { prisma } from '../../config/database';
import { ActivityAction, buildActivityLogData } from '../../utils/activityLog';
import { AppError } from '../../utils/AppError';
import { deleteRecordFromBackup, syncRecordToBackup } from '../../utils/backupSync';
import { validatePsgcHierarchy } from '../delivery/data/psgc-luzon.data';
import { isLocationInPanelScanCoverage } from '../delivery/delivery-coverage.config';
import { formatPhilippineDeliveryAddress } from '../delivery/utils/address-formatter';
import { normalizePhilippinePhone } from '../delivery/utils/phone-normalizer';
import { notifySystemIssue } from '../notifications/notification.triggers';
import type { AddressInput } from './address.validation';

const NCR_REGION_CODE = '130000000';
const MAX_ADDRESSES_PER_CUSTOMER = 20;
const NO_REQUEST_CONTEXT = { ipAddress: null, userAgent: null };

/** Default first, then oldest first - the order the profile list and the checkout picker show them in. */
const listOrder: Prisma.CustomerAddressOrderByWithRelationInput[] = [{ isDefault: 'desc' }, { createdAt: 'asc' }];

/**
 * Validates an address exactly the way checkout validates an order's
 * delivery location (official PSGC hierarchy + PanelScan delivery coverage),
 * so an address that saves is always one checkout will accept.
 */
const toAddressData = (input: AddressInput) => {
  const isNcr = input.regionCode === NCR_REGION_CODE;
  const provinceCode = isNcr ? null : input.provinceCode || null;
  const provinceName = isNcr ? null : input.provinceName || null;

  const hierarchy = validatePsgcHierarchy({
    regionCode: input.regionCode,
    provinceCode,
    cityMunicipalityCode: input.cityMunicipalityCode,
    barangayCode: input.barangayCode,
  });
  if (!hierarchy.isValid) {
    throw new AppError(hierarchy.error || 'The selected region, province, city, and barangay do not match.', 400);
  }
  if (!isLocationInPanelScanCoverage(input.regionCode, provinceCode)) {
    throw new AppError('This location is outside PanelScan delivery coverage. Delivery is currently available within selected areas in Luzon.', 400);
  }

  const formattedAddress = formatPhilippineDeliveryAddress({
    addressLine1: input.addressLine1,
    barangayName: input.barangayName,
    cityMunicipalityName: input.cityMunicipalityName,
    provinceName,
    regionName: input.regionName,
    postalCode: input.postalCode,
  });
  if (formattedAddress.length > 500) {
    throw new AppError('The combined address is too long. Shorten the street details.', 400);
  }

  return {
    label: input.label?.trim() || null,
    recipientName: input.recipientName,
    recipientPhone: normalizePhilippinePhone(input.recipientPhone),
    addressLine1: input.addressLine1,
    regionCode: input.regionCode,
    regionName: input.regionName,
    provinceCode,
    provinceName,
    cityMunicipalityCode: input.cityMunicipalityCode,
    cityMunicipalityName: input.cityMunicipalityName,
    barangayCode: input.barangayCode,
    barangayName: input.barangayName,
    postalCode: input.postalCode,
    formattedAddress,
    latitude: input.latitude,
    longitude: input.longitude,
  };
};

/**
 * Real-time backup sync for saved addresses, run only after the main
 * database transaction has committed (backupSync.ts's contract). Upsert by
 * id means a re-sync updates the existing backup row instead of adding a
 * duplicate. A failure never undoes the customer's save: it is recorded as a
 * BACKUP_SYNC_FAILED activity-log row, staff get a (throttled) system alert,
 * and the scheduled `npm run backup:sync` job - which includes this table -
 * is the retry.
 */
const recordBackupFailure = async (customerId: string, addressId: string, reason: string): Promise<void> => {
  try {
    await prisma.activityLog.create({
      data: buildActivityLogData(customerId, ActivityAction.BACKUP_SYNC_FAILED, NO_REQUEST_CONTEXT, { model: 'customerAddress', id: addressId, reason }),
    });
  } catch (error) {
    console.error('[addresses] Could not record a backup-sync failure:', error);
  }
  await notifySystemIssue({
    title: 'Backup sync failed',
    message: 'A saved customer address could not be synchronized to the backup database. It will be retried by the next scheduled backup sync.',
    event: 'BACKUP_SYNC_FAILED',
    metadata: { model: 'customerAddress', id: addressId },
  });
};

const syncAddressesToBackup = async (customerId: string, rows: CustomerAddress[]): Promise<void> => {
  if (!getBackupPrisma()) return;
  for (const row of rows) {
    const synced = await syncRecordToBackup('customerAddress', row as unknown as Record<string, unknown>);
    if (!synced) await recordBackupFailure(customerId, row.id, 'saved address upsert');
  }
};

export class AddressService {
  async listAddresses(customerId: string): Promise<CustomerAddress[]> {
    return prisma.customerAddress.findMany({ where: { customerId }, orderBy: listOrder });
  }

  /** 404 (not 403) for another customer's address, so address ids can't be probed. */
  async getOwnAddress(addressId: string, customerId: string): Promise<CustomerAddress> {
    const address = await prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!address || address.customerId !== customerId) {
      throw new AppError('Address not found.', 404);
    }
    return address;
  }

  async createAddress(customerId: string, input: AddressInput): Promise<CustomerAddress> {
    const data = toAddressData(input);

    const { created, changed } = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.customerAddress.count({ where: { customerId } });
      if (existingCount >= MAX_ADDRESSES_PER_CUSTOMER) {
        throw new AppError(`You can save up to ${MAX_ADDRESSES_PER_CUSTOMER} addresses. Delete one you no longer use first.`, 400);
      }

      // The first address is always the default, so checkout always has one to preselect.
      const isDefault = existingCount === 0 || input.isDefault === true;
      const unset = isDefault ? await this.clearDefault(tx, customerId) : [];
      const address = await tx.customerAddress.create({ data: { ...data, customerId, isDefault } });
      return { created: address, changed: [...unset, address] };
    });

    await syncAddressesToBackup(customerId, changed);
    return created;
  }

  async updateAddress(addressId: string, customerId: string, input: AddressInput): Promise<CustomerAddress> {
    const data = toAddressData(input);

    const { updated, changed } = await prisma.$transaction(async (tx) => {
      const existing = await tx.customerAddress.findUnique({ where: { id: addressId } });
      if (!existing || existing.customerId !== customerId) {
        throw new AppError('Address not found.', 404);
      }

      // Unticking "default" on the current default is ignored - the default
      // only ever moves by choosing another address, so one always exists.
      const becomesDefault = input.isDefault === true && !existing.isDefault;
      const unset = becomesDefault ? await this.clearDefault(tx, customerId) : [];
      const address = await tx.customerAddress.update({
        where: { id: addressId },
        data: { ...data, isDefault: existing.isDefault || becomesDefault },
      });
      return { updated: address, changed: [...unset, address] };
    });

    await syncAddressesToBackup(customerId, changed);
    return updated;
  }

  async setDefaultAddress(addressId: string, customerId: string): Promise<CustomerAddress> {
    const { updated, changed } = await prisma.$transaction(async (tx) => {
      const existing = await tx.customerAddress.findUnique({ where: { id: addressId } });
      if (!existing || existing.customerId !== customerId) {
        throw new AppError('Address not found.', 404);
      }
      if (existing.isDefault) return { updated: existing, changed: [] as CustomerAddress[] };

      const unset = await this.clearDefault(tx, customerId);
      const address = await tx.customerAddress.update({ where: { id: addressId }, data: { isDefault: true } });
      return { updated: address, changed: [...unset, address] };
    });

    await syncAddressesToBackup(customerId, changed);
    return updated;
  }

  /**
   * Orders never reference a saved address - checkout snapshots it into the
   * order itself - so deleting one can't affect any order, past or active,
   * and there's nothing to block on. Deleting the default promotes the most
   * recently updated remaining address.
   */
  async deleteAddress(addressId: string, customerId: string): Promise<void> {
    const promoted = await prisma.$transaction(async (tx) => {
      const existing = await tx.customerAddress.findUnique({ where: { id: addressId } });
      if (!existing || existing.customerId !== customerId) {
        throw new AppError('Address not found.', 404);
      }

      await tx.customerAddress.delete({ where: { id: addressId } });
      if (!existing.isDefault) return null;

      const next = await tx.customerAddress.findFirst({ where: { customerId }, orderBy: { updatedAt: 'desc' } });
      return next ? tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } }) : null;
    });

    if (getBackupPrisma()) {
      const deleted = await deleteRecordFromBackup('customer_addresses', addressId);
      if (!deleted) await recordBackupFailure(customerId, addressId, 'saved address delete');
    }
    if (promoted) await syncAddressesToBackup(customerId, [promoted]);
  }

  /** Unsets the customer's current default(s), returning the rows it changed so they can be backed up too. */
  private async clearDefault(tx: Prisma.TransactionClient, customerId: string): Promise<CustomerAddress[]> {
    const current = await tx.customerAddress.findMany({ where: { customerId, isDefault: true }, select: { id: true } });
    if (current.length === 0) return [];
    const ids = current.map((row) => row.id);
    await tx.customerAddress.updateMany({ where: { id: { in: ids } }, data: { isDefault: false } });
    return tx.customerAddress.findMany({ where: { id: { in: ids } } });
  }
}

export const addressService = new AddressService();
