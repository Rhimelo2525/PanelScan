import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { syncRecordToBackup } from '../../src/utils/backupSync';
import { createCustomer } from '../helpers/factories';
import app from '../helpers/testApp';

// Stand-ins for the Supabase backup: tests never reach the real one. The fake
// refuses a saved address whose customer it doesn't hold, as the real foreign key does.
const backupUsers = new Set<string>();
vi.mock('../../src/config/backupDatabase', () => ({ getBackupPrisma: () => ({}) }));
vi.mock('../../src/utils/backupSync', () => ({
  syncRecordToBackup: vi.fn(async (model: string, row: Record<string, unknown>) => {
    if (model === 'user') backupUsers.add(row.id as string);
    return model === 'user' || backupUsers.has(row.customerId as string);
  }),
  deleteRecordFromBackup: vi.fn(async () => true),
}));

// Real PSGC codes (City of Malolos, Bulacan), as in address.test.ts.
const HOME = {
  label: 'Home',
  recipientName: 'Maria Santos',
  recipientPhone: '0917 123 4567',
  addressLine1: '219 Talisay Street',
  regionCode: '030000000',
  regionName: 'Region III – Central Luzon',
  provinceCode: '0301400000',
  provinceName: 'Bulacan',
  cityMunicipalityCode: '0301410000',
  cityMunicipalityName: 'City of Malolos',
  barangayCode: '0301410049',
  barangayName: 'Santo Niño',
  postalCode: '3000',
  latitude: 14.8433,
  longitude: 120.8114,
};

beforeEach(() => {
  backupUsers.clear();
  vi.mocked(syncRecordToBackup).mockClear();
});

describe('Saved address backup sync', () => {
  it("copies a brand-new customer to the backup before their first address, so it isn't refused", async () => {
    const { token, user } = await createCustomer();

    const response = await request(app).post('/api/addresses').set({ Authorization: `Bearer ${token}` }).send(HOME);
    expect(response.status).toBe(201);

    const calls = vi.mocked(syncRecordToBackup).mock.calls.map(([model, row]) => [model, row.id]);
    expect(calls).toEqual([['user', user.id], ['customerAddress', response.body.data.address.id]]);
    const failures = await prisma.activityLog.count({ where: { userId: user.id, action: 'BACKUP_SYNC_FAILED' } });
    expect(failures).toBe(0);
  });
});
