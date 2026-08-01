import type { Request, Response } from 'express';

import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { InstallerService, installerService } from './installer.service';
import type { InstallerFilters } from './installer.types';

const parseInstallerFilters = (query: Request['query']): InstallerFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
});

export class InstallerController {
  constructor(private readonly installerService: InstallerService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const installer = await this.installerService.createInstaller(req.body);
    sendSuccess(res, 201, 'Installer created successfully.', { installer });
  });

  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await this.installerService.getActiveInstallers(parseInstallerFilters(req.query));
    sendSuccess(res, 200, 'Installers retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const installer = await this.installerService.getInstallerById(req.params.id as string);
    sendSuccess(res, 200, 'Installer retrieved successfully.', { installer });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const installer = await this.installerService.updateInstaller(req.params.id as string, req.body);
    sendSuccess(res, 200, 'Installer updated successfully.', { installer });
  });

  deactivate = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const installer = await this.installerService.deactivateInstaller(req.params.id as string);
    sendSuccess(res, 200, 'Installer deactivated successfully.', { installer });
  });
}

export const installerController = new InstallerController(installerService);
