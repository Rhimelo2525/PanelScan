import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { ArchiveService, archiveService } from './archive.service';
import { XLSX_CONTENT_TYPE, archiveFileName, buildArchiveWorkbook } from './archive.xlsx';

export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  /** OWNER/MODERATOR: the dashboard's current monthly cycle (archives any cycle that has ended). */
  getCurrentCycle = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError('Authentication required.', 401);
    const cycle = await this.archiveService.getCurrentCycle(req.user.role);
    sendSuccess(res, 200, 'Current dashboard cycle retrieved successfully.', { cycle });
  });

  /** OWNER: every archived cycle. */
  list = catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const archives = await this.archiveService.listArchives();
    sendSuccess(res, 200, 'Archives retrieved successfully.', { archives });
  });

  /** OWNER: one archived cycle with its frozen widget data, to view it on the dashboard. */
  get = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const archive = await this.archiveService.getArchiveDetail(req.params.archiveId as string);
    sendSuccess(res, 200, 'Archive retrieved successfully.', { archive });
  });

  /** OWNER: one archived cycle as a single Excel workbook (overview + one sheet per widget). */
  download = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const archive = await this.archiveService.getArchive(req.params.archiveId as string);
    const workbook = await buildArchiveWorkbook(archive);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${archiveFileName(archive)}"`);
    res.setHeader('Content-Length', String(workbook.length));
    res.status(200).send(workbook);
  });
}

export const archiveController = new ArchiveController(archiveService);
