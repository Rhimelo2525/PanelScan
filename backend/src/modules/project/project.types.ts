import type { Prisma, ProjectSource, ProjectStatus } from '@prisma/client';

export const projectInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  moderator: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.ProjectInclude;

export type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

/**
 * A project as the API returns it: with its reference code
 * ("PRJ-2026-1A2B3C4D") and, instead of the stored file location
 * (arDataUrl), where staff fetch the photo of the measured wall.
 */
export type ProjectView = Omit<ProjectWithRelations, 'arDataUrl'> & {
  projectCode: string;
  /** GET path (under /api) of the wall photo, staff only; null when the customer saved none. */
  wallPhotoUrl: string | null;
};

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProjectFilters {
  page?: number;
  limit?: number;
  status?: ProjectStatus;
  source?: ProjectSource;
  externalProjectId?: string;
  customerId?: string;
  moderatorId?: string;
  ownerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  /** A reference code ("PRJ-2026-1A2B3C4D"): the one project it names. */
  code?: string;
  sortBy?: 'name' | 'createdAt' | 'startDate' | 'endDate';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedProjects {
  projects: ProjectView[];
  pagination: PaginationMeta;
}

export interface CustomerFilters {
  page?: number;
  limit?: number;
  source?: ProjectSource;
  /** Words matched against first name, last name and email. */
  search?: string;
}

export interface ProjectCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  projectCount: number;
  lastProjectAt: Date | null;
}

export interface PaginatedProjectCustomers {
  customers: ProjectCustomer[];
  pagination: PaginationMeta;
}
