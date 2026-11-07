import type { Installer } from '@prisma/client';

export interface InstallerFilters {
  page?: number;
  limit?: number;
  search?: string;
  /** Defaults to active: the booking picker must never offer a deactivated installer. */
  status?: 'active' | 'inactive' | 'all';
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
