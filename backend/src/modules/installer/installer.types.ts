import type { Installer } from '@prisma/client';

export interface InstallerFilters {
  page?: number;
  limit?: number;
  search?: string;
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
