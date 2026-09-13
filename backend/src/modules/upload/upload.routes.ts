import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { UserRole } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';

const router = Router();

const uploadsDirectory = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDirectory)) {
  fs.mkdirSync(uploadsDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
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

// POST /api/upload - Staff (MODERATOR) can upload product imagery
router.post(
  '/',
  authenticate,
  restrictTo(UserRole.MODERATOR),
  upload.single('image'),
  catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw new AppError('Please provide an image file to upload.', 400);
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
