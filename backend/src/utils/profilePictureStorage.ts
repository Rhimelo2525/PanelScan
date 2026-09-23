import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { del, list, put } from '@vercel/blob';

import { env } from '../config/env';

/**
 * Storage for customer profile pictures, in one of two modes:
 *
 *   - Vercel Blob (when BLOB_READ_WRITE_TOKEN is set - auto-populated by
 *     Vercel once a Blob store is attached to the project): real persistent
 *     object storage. The "path" this module returns/stores is then the
 *     blob's full public URL, not a relative path.
 *   - Local disk (everywhere else - local dev, or any non-Vercel host):
 *     unchanged from before Blob was wired in.
 *
 *   <uploads root>/profiles/<customer id>/<random uuid>.webp   (local disk)
 *   https://<store>.public.blob.vercel-storage.com/profiles/<customer id>/<random uuid>.webp   (Blob)
 *
 * Either way, the folder comes from the authenticated user id, the file name
 * is a fresh random UUID, and the extension is always .webp (the processing
 * step re-encodes every upload). No part of a path is ever taken from the
 * client, which is what rules out directory traversal and one customer
 * overwriting another's file.
 *
 * IMPORTANT: local disk (including Vercel's own /tmp) does NOT persist
 * between requests on a serverless host - a later request can land on a
 * fresh instance with an empty filesystem. Blob mode exists specifically to
 * make uploads survive that; local-disk mode is only correct for a host with
 * a real persistent filesystem (a normal server, a container with a mounted
 * volume, or local dev).
 */
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const isBlobMode = Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID);

// Same root app.ts serves at /uploads and upload.routes.ts writes product images to (local-disk mode only).
export const uploadsRoot = isServerless ? path.join('/tmp', 'uploads') : path.resolve(process.cwd(), env.UPLOAD_DIR);

export const PROFILE_PICTURES_FOLDER = 'profiles';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID}$`, 'i');
// The only shape a stored path may ever have - anything else is refused outright.
const STORED_PATH_PATTERN = new RegExp(`^${PROFILE_PICTURES_FOLDER}/(${UUID})/${UUID}\\.webp$`, 'i');

const isStoredUrl = (stored: string): boolean => /^https?:\/\//i.test(stored);

/** A stored value is either a relative disk path already, or a full Blob URL whose pathname has that same shape. */
const relativePathOf = (stored: string): string => {
  if (!isStoredUrl(stored)) return stored;
  try {
    return new URL(stored).pathname.replace(/^\/+/, '');
  } catch {
    return '';
  }
};

const userDirectory = (userId: string): string => {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('Invalid user id for profile picture storage.');
  }
  return path.join(uploadsRoot, PROFILE_PICTURES_FOLDER, userId);
};

const userBlobPrefix = (userId: string): string => {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('Invalid user id for profile picture storage.');
  }
  return `${PROFILE_PICTURES_FOLDER}/${userId}/`;
};

/**
 * Turns a stored relative (local-disk) path back into an absolute one,
 * refusing anything that doesn't match the exact shape this module writes.
 * Not meaningful for a Blob URL - callers check isStoredUrl() first (see
 * profilePicture.controller.ts, which redirects to a Blob URL instead of
 * resolving/streaming it from disk).
 */
export const resolveProfilePicturePath = (relativePath: string): string => {
  if (!STORED_PATH_PATTERN.test(relativePath)) {
    throw new Error('Refusing to resolve an unexpected profile picture path.');
  }
  return path.join(uploadsRoot, ...relativePath.split('/'));
};

/** True when `stored` (a relative disk path or a Blob URL) is a well-formed profile picture path belonging to `userId`. */
export const isProfilePicturePathOwnedBy = (stored: string, userId: string): boolean => {
  const match = STORED_PATH_PATTERN.exec(relativePathOf(stored));
  return match !== null && match[1]!.toLowerCase() === userId.toLowerCase();
};

/** True when `stored` is a Blob URL rather than a local-disk relative path - callers (the controller) branch on this. */
export { isStoredUrl as isProfilePictureUrl };

/** Writes the processed image under a fresh random name and returns its stored path (a Blob URL in Blob mode, a relative disk path otherwise). */
export const saveProfilePicture = async (userId: string, data: Buffer): Promise<string> => {
  const fileName = `${randomUUID()}.webp`;

  if (isBlobMode) {
    const blob = await put(`${PROFILE_PICTURES_FOLDER}/${userId}/${fileName}`, data, {
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: false, // this module already guarantees a fresh random UUID per upload
    });
    return blob.url;
  }

  const directory = userDirectory(userId);
  await fs.promises.mkdir(directory, { recursive: true });
  // 'wx' fails instead of overwriting, so an existing file can never be replaced.
  await fs.promises.writeFile(path.join(directory, fileName), data, { flag: 'wx' });
  return `${PROFILE_PICTURES_FOLDER}/${userId}/${fileName}`;
};

export const deleteProfilePictureFile = async (stored: string): Promise<void> => {
  if (isStoredUrl(stored)) {
    await del(stored);
    return;
  }
  await fs.promises.rm(resolveProfilePicturePath(stored), { force: true });
};

/**
 * Deletes every picture file the customer has except `keepStored`
 * (pass nothing to delete them all). Sweeping the folder/prefix rather than
 * deleting "the previous file" also clears leftovers from an earlier failed
 * delete or from two uploads racing each other, so storage can't slowly
 * accumulate orphans.
 */
export const purgeProfilePictures = async (userId: string, keepStored?: string): Promise<void> => {
  if (isBlobMode) {
    const { blobs } = await list({ prefix: userBlobPrefix(userId) });
    await Promise.all(blobs.filter((blob) => blob.url !== keepStored).map((blob) => del(blob.url)));
    return;
  }

  const directory = userDirectory(userId);
  let names: string[];
  try {
    names = await fs.promises.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  const keep = keepStored ? path.posix.basename(keepStored) : null;
  await Promise.all(names.filter((name) => name !== keep).map((name) => fs.promises.rm(path.join(directory, name), { force: true })));

  if (!keep) {
    await fs.promises.rmdir(directory).catch(() => undefined);
  }
};
