import path from 'path';
import { UserRole } from '@prisma/client';
import sharp from 'sharp';

import { prisma } from '../../config/database';
import { ActivityAction, buildActivityLogData, type RequestAuditContext } from '../../utils/activityLog';
import { AppError } from '../../utils/AppError';
import { ALLOWED_IMAGE_EXTENSIONS, detectImageType } from '../../utils/imageSniff';
import {
  deleteProfilePictureFile,
  isProfilePicturePathOwnedBy,
  purgeProfilePictures,
  saveProfilePicture,
} from '../../utils/profilePictureStorage';
import { MAX_PROFILE_PICTURE_BYTES } from './profilePicture.upload';

const OUTPUT_SIZE_PX = 512;
const OUTPUT_QUALITY = 82;
// ~8000 x 5000. A tiny PNG can declare enormous dimensions and balloon into
// gigabytes of pixels when decoded (a "decompression bomb"); sharp refuses
// anything above this instead of trying.
const MAX_INPUT_PIXELS = 40_000_000;

const MESSAGES = {
  invalidType: 'Please upload a JPG, PNG, or WEBP image.',
  tooLarge: 'Image size must be less than 5MB.',
  unreadable: "We couldn't read that image. It may be damaged - please try a different file.",
  storage: "We couldn't save your photo right now. Please try again shortly.",
  notFound: 'Profile picture not found.',
} as const;

export interface UploadedImage {
  buffer: Buffer;
  originalname: string;
}

export interface PictureViewer {
  id: string;
  role: UserRole;
}

export class ProfilePictureService {
  /**
   * The one place an upload is judged. Three independent checks, all of which
   * must pass: the extension is one we allow, the leading bytes are really a
   * JPEG/PNG/WebP, and sharp can decode the whole file. The last one is what
   * rejects truncated or corrupted images and anything merely dressed up as one.
   *
   * The output is a brand-new image, not the upload: auto-rotated from EXIF,
   * centre-cropped to a square, resized and re-encoded as WebP. sharp writes
   * no metadata unless asked, so location data (EXIF GPS), camera details and
   * any payload hidden in metadata or trailing bytes never reach storage.
   */
  async processImage(file: UploadedImage): Promise<Buffer> {
    if (file.buffer.length > MAX_PROFILE_PICTURE_BYTES) {
      throw new AppError(MESSAGES.tooLarge, 413);
    }

    const extension = path.extname(file.originalname ?? '').toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(extension) || detectImageType(file.buffer) === null) {
      throw new AppError(MESSAGES.invalidType, 400);
    }

    try {
      return await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(OUTPUT_SIZE_PX, OUTPUT_SIZE_PX, { fit: 'cover', position: 'centre' })
        .webp({ quality: OUTPUT_QUALITY })
        .toBuffer();
    } catch {
      throw new AppError(MESSAGES.unreadable, 400);
    }
  }

  /**
   * `userId` is always the authenticated caller (from the verified token),
   * never anything in the request body - so a customer can only ever write
   * to their own folder and their own row.
   */
  async setProfilePicture(userId: string, file: UploadedImage, context: RequestAuditContext): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, profilePicturePath: true } });
    if (!user) {
      throw new AppError('User not found.', 404);
    }

    const processed = await this.processImage(file);

    let newPath: string;
    try {
      newPath = await saveProfilePicture(userId, processed);
    } catch (error) {
      console.error('[profilePicture] Could not store the image:', error);
      throw new AppError(MESSAGES.storage, 503);
    }

    try {
      // The row change and its audit record commit together or not at all.
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { profilePicturePath: newPath, profilePictureUpdatedAt: new Date() } }),
        prisma.activityLog.create({
          data: buildActivityLogData(userId, ActivityAction.PROFILE_PICTURE_UPDATED, context, {
            replaced: user.profilePicturePath !== null,
            originalBytes: file.buffer.length,
            storedBytes: processed.length,
          }),
        }),
      ]);
    } catch (error) {
      // Don't leave an unreferenced file behind when the record couldn't be saved.
      await deleteProfilePictureFile(newPath).catch((cleanupError) => console.error('[profilePicture] Cleanup failed:', cleanupError));
      throw error;
    }

    // Only after the database points at the new file is the old one removed,
    // so a failure here can never leave the customer without a picture.
    await purgeProfilePictures(userId, newPath).catch((error) => console.error('[profilePicture] Could not remove old images:', error));
  }

  /** Idempotent: removing a picture that isn't there succeeds without writing an audit record. */
  async removeProfilePicture(userId: string, context: RequestAuditContext): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, profilePicturePath: true } });
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    if (!user.profilePicturePath) {
      return;
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { profilePicturePath: null, profilePictureUpdatedAt: null } }),
      prisma.activityLog.create({ data: buildActivityLogData(userId, ActivityAction.PROFILE_PICTURE_REMOVED, context) }),
    ]);

    await purgeProfilePictures(userId).catch((error) => console.error('[profilePicture] Could not remove images:', error));
  }

  /**
   * Who may view a picture: the customer it belongs to, and staff (OWNER /
   * MODERATOR) - the same rule as GET /api/users/:id. Anyone else gets a 404,
   * not a 403, so the response never confirms that another customer has a
   * picture at all (the API's convention for ownership violations).
   */
  async getPictureFile(targetUserId: string, viewer: PictureViewer): Promise<{ relativePath: string; updatedAt: Date }> {
    if (viewer.role === UserRole.CUSTOMER && viewer.id !== targetUserId) {
      throw new AppError(MESSAGES.notFound, 404);
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { profilePicturePath: true, profilePictureUpdatedAt: true },
    });

    // The ownership check on the stored path is a second, independent guard: even a
    // tampered database value can't make one account serve another account's file.
    if (
      !target?.profilePicturePath ||
      !target.profilePictureUpdatedAt ||
      !isProfilePicturePathOwnedBy(target.profilePicturePath, targetUserId)
    ) {
      throw new AppError(MESSAGES.notFound, 404);
    }

    return { relativePath: target.profilePicturePath, updatedAt: target.profilePictureUpdatedAt };
  }
}

export const profilePictureService = new ProfilePictureService();
