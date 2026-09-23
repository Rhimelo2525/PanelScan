import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Vercel's Blob store can be connected to a project in two different ways,
 * confirmed against a real connection (`vercel storage connect`):
 *   - Older: a static BLOB_READ_WRITE_TOKEN (covered by
 *     profilePictureStorage.blob.test.ts)
 *   - Newer: OIDC-based - only BLOB_STORE_ID is set as a project env var,
 *     and the @vercel/blob SDK automatically uses Vercel's own
 *     runtime-injected OIDC token alongside it (nothing else needed).
 * isBlobMode must turn on for EITHER one alone. This file exercises the
 * second case in isolation - BLOB_STORE_ID present, BLOB_READ_WRITE_TOKEN
 * absent - since isBlobMode is computed once at module top-level and a
 * single mocked env can't represent both cases in the same test file.
 */
vi.mock('../../src/config/env', () => ({
  env: { BLOB_STORE_ID: 'store_fake123', UPLOAD_DIR: 'uploads' },
}));

const put = vi.fn();
vi.mock('@vercel/blob', () => ({ put, del: vi.fn(), list: vi.fn() }));

// Imported inside beforeAll (not a top-level `await import`) purely to keep
// this a CommonJS-compatible file under the project's NodeNext tsconfig -
// see profilePictureStorage.blob.test.ts's own comment on this same pattern.
let saveProfilePicture: typeof import('../../src/utils/profilePictureStorage.js').saveProfilePicture;

beforeAll(async () => {
  ({ saveProfilePicture } = await import('../../src/utils/profilePictureStorage.js'));
});

const USER_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

describe('profilePictureStorage - Blob mode via BLOB_STORE_ID alone (OIDC)', () => {
  it('activates Blob mode (calls Blob put(), not local disk) with no BLOB_READ_WRITE_TOKEN set', async () => {
    put.mockResolvedValue({ url: 'https://example.public.blob.vercel-storage.com/profiles/placeholder.webp' });

    const result = await saveProfilePicture(USER_ID, Buffer.from('fake-image-bytes'));

    expect(put).toHaveBeenCalledTimes(1);
    expect(result).toBe('https://example.public.blob.vercel-storage.com/profiles/placeholder.webp');
  });
});
