import type { RequestHandler } from 'express';
import multer from 'multer';

import { AppError } from '../../utils/AppError';

export const MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024;

// Memory, not disk: an untrusted file never touches the filesystem until it has
// been decoded and re-encoded. The size cap below bounds how much one request
// can hold in memory. Nothing but the single "image" part is accepted.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROFILE_PICTURE_BYTES, files: 1, fields: 5, parts: 10 },
});

/**
 * Wraps multer so its failures use this API's normal error envelope. Left
 * alone, a MulterError (e.g. an oversized file) isn't an AppError and would
 * surface as a generic 500 instead of a message the customer can act on.
 */
export const receiveProfileImage: RequestHandler = (req, res, next) => {
  upload.single('image')(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('Image size must be less than 5MB.', 413));
      return;
    }
    if (error instanceof multer.MulterError) {
      next(new AppError('Please upload a single image.', 400));
      return;
    }
    // A malformed multipart body, an aborted upload, etc.
    next(new AppError('The upload could not be read. Please try again.', 400));
  });
};
