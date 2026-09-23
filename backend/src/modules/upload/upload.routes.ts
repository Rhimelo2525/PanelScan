import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { put } from '@vercel/blob';
import { UserRole } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';

const router = Router();

// See src/utils/profilePictureStorage.ts for the full rationale - local disk
// (including Vercel's own /tmp) does not persist between requests on a
// serverless host, so product images use Vercel Blob there instead whenever
// BLOB_READ_WRITE_TOKEN is configured.
const isBlobMode = Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID);
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadsDirectory = isServerless
  ? path.join('/tmp', 'uploads')
  : path.resolve(process.cwd(), env.UPLOAD_DIR);

if (!isBlobMode && !fs.existsSync(uploadsDirectory)) {
  try {
    fs.mkdirSync(uploadsDirectory, { recursive: true });
  } catch (err) {
    console.error('Failed to create uploads directory:', err);
  }
}

const storage = isBlobMode
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(uploadsDirectory)) {
          try {
            fs.mkdirSync(uploadsDirectory, { recursive: true });
          } catch (err) {
            return cb(err as Error, uploadsDirectory);
          }
        }
        cb(null, uploadsDirectory);
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}${ext}`;
        cb(null, uniqueSuffix);
      },
    });

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only image files (JPEG, PNG, WebP, GIF) are allowed.', 400));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

// POST /api/upload - Staff (OWNER and MODERATOR) can upload product imagery
router.post(
  '/',
  authenticate,
  restrictTo(UserRole.OWNER, UserRole.MODERATOR),
  upload.single('image'),
  catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw new AppError('Please provide an image file to upload.', 400);
    }

    if (isBlobMode) {
      const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
      const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      const blob = await put(`products/${filename}`, req.file.buffer, {
        access: 'public',
        contentType: req.file.mimetype,
        addRandomSuffix: false,
      });

      sendSuccess(res, 201, 'Image uploaded successfully.', {
        url: blob.url,
        relativeUrl: blob.url,
        filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });
      return;
    }

    const host = req.get('host') ?? 'localhost:4000';
    const protocol = req.protocol === 'https' ? 'https' : 'http';
    const relativeUrl = `/uploads/${req.file.filename}`;
    const fullUrl = `${protocol}://${host}${relativeUrl}`;

    sendSuccess(res, 201, 'Image uploaded successfully.', {
      url: fullUrl,
      relativeUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  }),
);

export default router;
