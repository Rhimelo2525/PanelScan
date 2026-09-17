import type { Installer } from '@prisma/client';

export interface InstallerFilters {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedInstallers {
  installers: Installer[];
  pagination: PaginationMeta;
}
