import type { Prisma, ProjectStatus } from '@prisma/client';

export const projectInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  moderator: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.ProjectInclude;

export type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

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
  customerId?: string;
  moderatorId?: string;
  ownerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'startDate' | 'endDate';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedProjects {
  projects: ProjectWithRelations[];
  pagination: PaginationMeta;
}
