/**
 * A project's reference code, e.g. "PRJ-2026-1A2B3C4D": the year it was
 * created (Philippine time) and the first 8 hex digits of its id. It is
 * derived, not stored, so every project has one without a schema change;
 * the customer can quote it and staff can look the project up by it.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export const PROJECT_CODE_PATTERN = /^PRJ-(\d{4})-([0-9A-F]{8})$/i;

export const projectCodeFor = (project: { id: string; createdAt: Date }): string => {
  const year = new Date(project.createdAt.getTime() + MANILA_OFFSET_MS).getUTCFullYear();
  return `PRJ-${year}-${project.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
};

export interface ProjectCodeLookup {
  /** UUIDs starting with the code's 8 hex digits lie between these two. */
  idFrom: string;
  idTo: string;
  /** The code's year, in Philippine time. */
  createdFrom: Date;
  createdBefore: Date;
}

/** Where to look for the project with this code; null when it isn't a project code. */
export const parseProjectCode = (code: string): ProjectCodeLookup | null => {
  const match = PROJECT_CODE_PATTERN.exec(code.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const prefix = match[2]!.toLowerCase();
  return {
    idFrom: `${prefix}-0000-0000-0000-000000000000`,
    idTo: `${prefix}-ffff-ffff-ffff-ffffffffffff`,
    createdFrom: new Date(Date.UTC(year, 0, 1) - MANILA_OFFSET_MS),
    createdBefore: new Date(Date.UTC(year + 1, 0, 1) - MANILA_OFFSET_MS),
  };
};
