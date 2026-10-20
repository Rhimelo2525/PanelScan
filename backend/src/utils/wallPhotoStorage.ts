import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { del, list, put } from '@vercel/blob';

import { env } from '../config/env';
import { uploadsRoot } from './profilePictureStorage';

/**
 * Storage for the photo of a measured wall a customer saves with a mobile
 * project, in the same two modes as profile pictures (see
 * profilePictureStorage.ts): Vercel Blob when a Blob store is attached, local
 * disk everywhere else.
 *
 *   <uploads root>/wall-photos/<project id>/<random uuid>.jpg   (local disk)
 *   https://<store>.public.blob.vercel-storage.com/wall-photos/<project id>/<random uuid>.jpg   (Blob)
 *
 * The folder comes from the project id and the name is a fresh random UUID;
 * nothing in a path is taken from the client. The photos are staff-only: they
 * are served by GET /api/projects/:id/wall-photo after its role check, never
 * by the public /uploads mount (app.ts refuses that folder).
 */
const isBlobMode = Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID);

export const WALL_PHOTOS_FOLDER = 'wall-photos';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID}$`, 'i');
// The only shape a stored path may ever have - anything else is refused outright.
const STORED_PATH_PATTERN = new RegExp(`^${WALL_PHOTOS_FOLDER}/(${UUID})/(${UUID})\\.jpg$`, 'i');

export const isWallPhotoUrl = (stored: string): boolean => /^https?:\/\//i.test(stored);

/** A stored value is either a relative disk path already, or a full Blob URL whose pathname has that same shape. */
const relativePathOf = (stored: string): string => {
  if (!isWallPhotoUrl(stored)) return stored;
  try {
    return new URL(stored).pathname.replace(/^\/+/, '');
  } catch {
    return '';
  }
};

const checkedProjectId = (projectId: string): string => {
  if (!UUID_PATTERN.test(projectId)) {
    throw new Error('Invalid project id for wall photo storage.');
  }
  return projectId;
};

/** True when `stored` is a well-formed wall photo path belonging to `projectId`. */
export const isWallPhotoPathOwnedBy = (stored: string, projectId: string): boolean => {
  const match = STORED_PATH_PATTERN.exec(relativePathOf(stored));
  return match !== null && match[1]!.toLowerCase() === projectId.toLowerCase();
};

/** The photo's version for cache-busting URLs: its random file name. */
export const wallPhotoVersion = (stored: string): string | null => STORED_PATH_PATTERN.exec(relativePathOf(stored))?.[2] ?? null;

/** Writes the processed photo under a fresh random name and returns its stored path (a Blob URL in Blob mode, a relative disk path otherwise). */
export const saveWallPhoto = async (projectId: string, data: Buffer): Promise<string> => {
  const relativePath = `${WALL_PHOTOS_FOLDER}/${checkedProjectId(projectId)}/${randomUUID()}.jpg`;

  if (isBlobMode) {
    const blob = await put(relativePath, data, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: false });
    return blob.url;
  }

  const file = path.join(uploadsRoot, ...relativePath.split('/'));
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  // 'wx' fails instead of overwriting, so an existing file can never be replaced.
  await fs.promises.writeFile(file, data, { flag: 'wx' });
  return relativePath;
};

/** The absolute disk path of a stored relative path, refusing anything not of the exact shape this module writes. */
export const resolveWallPhotoPath = (relativePath: string): string => {
  if (!STORED_PATH_PATTERN.test(relativePath)) {
    throw new Error('Refusing to resolve an unexpected wall photo path.');
  }
  return path.join(uploadsRoot, ...relativePath.split('/'));
};

/** Deletes every photo of the project except `keepStored` (pass nothing to delete them all). */
export const purgeWallPhotos = async (projectId: string, keepStored?: string): Promise<void> => {
  const prefix = `${WALL_PHOTOS_FOLDER}/${checkedProjectId(projectId)}/`;
  if (isBlobMode) {
    const { blobs } = await list({ prefix });
    await Promise.all(blobs.filter((blob) => blob.url !== keepStored).map((blob) => del(blob.url)));
    return;
  }

  const directory = path.join(uploadsRoot, WALL_PHOTOS_FOLDER, projectId);
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
