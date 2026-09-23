import { afterEach, describe, expect, it, vi } from 'vitest';

// Vercel Blob mode is only reachable when BLOB_READ_WRITE_TOKEN is set, which
// isn't true in the normal test environment (see tests/setupEnv.ts) - so this
// file mocks both the env module and @vercel/blob itself, the same pattern
// already used for geocoding.test.ts's provider-mode tests. isBlobMode is
// computed once at profilePictureStorage.ts's module top-level, so both mocks
// must be in place (vitest hoists vi.mock above the imports below) before
// that module is ever imported.
vi.mock('../../src/config/env', () => ({
  env: { BLOB_READ_WRITE_TOKEN: 'fake-test-blob-token', UPLOAD_DIR: 'uploads' },
}));

const put = vi.fn();
const del = vi.fn();
const list = vi.fn();
vi.mock('@vercel/blob', () => ({ put, del, list }));

const { deleteProfilePictureFile, isProfilePictureUrl, isProfilePicturePathOwnedBy, purgeProfilePictures, saveProfilePicture } =
  await import('../../src/utils/profilePictureStorage');

const USER_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const OTHER_USER_ID = 'ffffffff-ffff-4fff-afff-ffffffffffff';

afterEach(() => {
  vi.clearAllMocks();
});

describe('profilePictureStorage - Vercel Blob mode', () => {
  it('saveProfilePicture() uploads to Blob under profiles/<userId>/<uuid>.webp and returns the Blob URL', async () => {
    put.mockResolvedValue({ url: 'https://example.public.blob.vercel-storage.com/profiles/placeholder.webp' });

    const result = await saveProfilePicture(USER_ID, Buffer.from('fake-image-bytes'));

    expect(put).toHaveBeenCalledTimes(1);
    const [pathname, body, options] = put.mock.calls[0] as [string, Buffer, Record<string, unknown>];
    expect(pathname).toMatch(new RegExp(`^profiles/${USER_ID}/[0-9a-f-]{36}\\.webp$`, 'i'));
    expect(body).toBeInstanceOf(Buffer);
    expect(options).toMatchObject({ access: 'public', contentType: 'image/webp', addRandomSuffix: false });
    expect(result).toBe('https://example.public.blob.vercel-storage.com/profiles/placeholder.webp');
  });

  it('isProfilePictureUrl() distinguishes a Blob URL from a local-disk relative path', () => {
    expect(isProfilePictureUrl('https://example.public.blob.vercel-storage.com/profiles/x/y.webp')).toBe(true);
    expect(isProfilePictureUrl('profiles/x/y.webp')).toBe(false);
  });

  it('isProfilePicturePathOwnedBy() validates a Blob URL by its pathname, same rules as a local-disk path', () => {
    const ownUrl = `https://example.public.blob.vercel-storage.com/profiles/${USER_ID}/${'11111111-1111-4111-8111-111111111111'}.webp`;
    expect(isProfilePicturePathOwnedBy(ownUrl, USER_ID)).toBe(true);
    expect(isProfilePicturePathOwnedBy(ownUrl, OTHER_USER_ID)).toBe(false);
  });

  it('isProfilePicturePathOwnedBy() refuses a malformed or unexpected URL shape rather than throwing', () => {
    expect(isProfilePicturePathOwnedBy('https://example.public.blob.vercel-storage.com/something-else.webp', USER_ID)).toBe(false);
    expect(isProfilePicturePathOwnedBy('not a url at all', USER_ID)).toBe(false);
  });

  it('deleteProfilePictureFile() calls Blob del() with the stored URL', async () => {
    const url = `https://example.public.blob.vercel-storage.com/profiles/${USER_ID}/${'22222222-2222-4222-8222-222222222222'}.webp`;
    await deleteProfilePictureFile(url);
    expect(del).toHaveBeenCalledWith(url);
  });

  it('purgeProfilePictures() lists the user\'s prefix and deletes everything except the one to keep', async () => {
    const keepUrl = `https://example.public.blob.vercel-storage.com/profiles/${USER_ID}/keep.webp`;
    const staleUrl = `https://example.public.blob.vercel-storage.com/profiles/${USER_ID}/stale.webp`;
    list.mockResolvedValue({ blobs: [{ url: keepUrl }, { url: staleUrl }] });

    await purgeProfilePictures(USER_ID, keepUrl);

    expect(list).toHaveBeenCalledWith({ prefix: `profiles/${USER_ID}/` });
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(staleUrl);
  });

  it('purgeProfilePictures() with no keep argument deletes everything under the prefix', async () => {
    const urlA = `https://example.public.blob.vercel-storage.com/profiles/${USER_ID}/a.webp`;
    const urlB = `https://example.public.blob.vercel-storage.com/profiles/${USER_ID}/b.webp`;
    list.mockResolvedValue({ blobs: [{ url: urlA }, { url: urlB }] });

    await purgeProfilePictures(USER_ID);

    expect(del).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith(urlA);
    expect(del).toHaveBeenCalledWith(urlB);
  });
});
