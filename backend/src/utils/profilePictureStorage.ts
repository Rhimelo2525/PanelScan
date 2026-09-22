import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { env } from '../config/env';

/**
 * Local-disk storage for customer profile pictures, following the layout the
 * product-image upload already uses (UPLOAD_DIR, or /tmp on serverless hosts):
 *
 *   <uploads root>/profiles/<customer id>/<random uuid>.webp
 *
 * Everything that can reach the filesystem is decided here on the server: the
 * folder comes from the authenticated user id, the file name is a fresh random
 * UUID, and the extension is always .webp (the processing step re-encodes
 * every upload). No part of a path is ever taken from the client, which is
 * what rules out directory traversal and one customer overwriting another's
 * file. Swapping to cloud storage later means replacing this one file.
 */
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Same root app.ts serves at /uploads and upload.routes.ts writes product images to.
export const uploadsRoot = isServerless ? path.join('/tmp', 'uploads') : path.resolve(process.cwd(), env.UPLOAD_DIR);

export const PROFILE_PICTURES_FOLDER = 'profiles';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID}$`, 'i');
// The only shape a stored path may ever have - anything else is refused outright.
const STORED_PATH_PATTERN = new RegExp(`^${PROFILE_PICTURES_FOLDER}/(${UUID})/${UUID}\\.webp$`, 'i');

const userDirectory = (userId: string): string => {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('Invalid user id for profile picture storage.');
  }
  return path.join(uploadsRoot, PROFILE_PICTURES_FOLDER, userId);
};

/**
 * Turns a stored relative path back into an absolute one, refusing anything
 * that doesn't match the exact shape this module writes - the guard against a
 * tampered database value ever pointing outside the profiles folder.
 */
export const resolveProfilePicturePath = (relativePath: string): string => {
  if (!STORED_PATH_PATTERN.test(relativePath)) {
    throw new Error('Refusing to resolve an unexpected profile picture path.');
  }
  return path.join(uploadsRoot, ...relativePath.split('/'));
};

/** True when `relativePath` is a well-formed profile picture path belonging to `userId`. */
export const isProfilePicturePathOwnedBy = (relativePath: string, userId: string): boolean => {
  const match = STORED_PATH_PATTERN.exec(relativePath);
  return match !== null && match[1]!.toLowerCase() === userId.toLowerCase();
};

/** Writes the processed image under a fresh random name and returns its relative path (forward slashes on every OS). */
export const saveProfilePicture = async (userId: string, data: Buffer): Promise<string> => {
  const directory = userDirectory(userId);
  await fs.promises.mkdir(directory, { recursive: true });

  const fileName = `${randomUUID()}.webp`;
  // 'wx' fails instead of overwriting, so an existing file can never be replaced.
  await fs.promises.writeFile(path.join(directory, fileName), data, { flag: 'wx' });
  return `${PROFILE_PICTURES_FOLDER}/${userId}/${fileName}`;
};

export const deleteProfilePictureFile = async (relativePath: string): Promise<void> => {
  await fs.promises.rm(resolveProfilePicturePath(relativePath), { force: true });
};

/**
 * Deletes every picture file the customer has except `keepRelativePath`
 * (pass nothing to delete them all). Sweeping the folder rather than deleting
 * "the previous file" also clears leftovers from an earlier failed delete or
 * from two uploads racing each other, so storage can't slowly accumulate
 * orphans.
 */
export const purgeProfilePictures = async (userId: string, keepRelativePath?: string): Promise<void> => {
  const directory = userDirectory(userId);

  let names: string[];
  try {
    names = await fs.promises.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  const keep = keepRelativePath ? path.posix.basename(keepRelativePath) : null;
  await Promise.all(names.filter((name) => name !== keep).map((name) => fs.promises.rm(path.join(directory, name), { force: true })));

  if (!keep) {
    await fs.promises.rmdir(directory).catch(() => undefined);
  }
};
