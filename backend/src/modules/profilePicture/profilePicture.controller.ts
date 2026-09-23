import type { NextFunction, Request, Response } from 'express';

import { getRequestAuditContext } from '../../utils/activityLog';
import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { isProfilePictureUrl, uploadsRoot } from '../../utils/profilePictureStorage';
import { sendSuccess } from '../../utils/response';
import { AuthService, authService } from '../auth/auth.service';
import { ProfilePictureService, profilePictureService } from './profilePicture.service';

export class ProfilePictureController {
  constructor(
    private readonly service: ProfilePictureService,
    private readonly auth: AuthService,
  ) {}

  upload = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    if (!req.file) {
      throw new AppError('Please choose an image to upload.', 400);
    }

    // Identity comes only from the verified token; nothing in the body or query is consulted.
    await this.service.setProfilePicture(req.user.id, req.file, getRequestAuditContext(req));
    const user = await this.auth.getCurrentUser(req.user.id);
    sendSuccess(res, 200, 'Profile picture updated successfully.', { user });
  });

  remove = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }

    await this.service.removeProfilePicture(req.user.id, getRequestAuditContext(req));
    const user = await this.auth.getCurrentUser(req.user.id);
    sendSuccess(res, 200, 'Profile picture removed successfully.', { user });
  });

  view = catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }

    const { relativePath, updatedAt } = await this.service.getPictureFile(req.params.id as string, req.user);

    // Each upload gets a brand-new file name and version, so a response whose ?v=
    // matches the current version can never change and may be cached for good.
    // Anything else (no version, a stale one) is revalidated every time via ETag.
    const isCurrentVersion = req.query.v === String(updatedAt.getTime());

    // Blob mode: the permission check above already ran, so it's safe to hand
    // the client the (unguessable, UUID-named) Blob URL directly - the CDN
    // serves the actual bytes, this server never proxies them.
    if (isProfilePictureUrl(relativePath)) {
      res.set('Cache-Control', isCurrentVersion ? 'private, max-age=31536000, immutable' : 'private, no-cache');
      res.redirect(302, relativePath);
      return;
    }

    // `root` + a relative path makes express refuse any traversal on top of the
    // service's own path checks. `private` keeps shared caches/CDNs from storing it.
    res.sendFile(
      relativePath,
      {
        root: uploadsRoot,
        dotfiles: 'deny',
        cacheControl: false,
        headers: {
          'Cache-Control': isCurrentVersion ? 'private, max-age=31536000, immutable' : 'private, no-cache',
          'Content-Type': 'image/webp',
          'X-Content-Type-Options': 'nosniff',
        },
      },
      (error) => {
        if (error && !res.headersSent) {
          next(new AppError('Profile picture not found.', 404));
        }
      },
    );
  });
}

export const profilePictureController = new ProfilePictureController(profilePictureService, authService);
