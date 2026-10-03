import { z } from 'zod';

/** The `search` query parameter of the admin list pages. */
export const listSearchQuery = z.string().trim().min(1, 'Search query cannot be empty.').max(100, 'Search query is too long.').optional();

/** Case-insensitive "contains" filter for a Prisma string field. */
export const containsText = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/**
 * Turns a search box value into a Prisma filter: every word has to match at
 * least one of the given fields, so "kevin santos" finds first name Kevin +
 * last name Santos. `fieldsFor(word)` returns the per-field conditions for
 * one word. Returns undefined for an empty search (no filter).
 */
export const searchWords = <Where>(search: string | undefined, fieldsFor: (word: string) => Where[]): { AND: Array<{ OR: Where[] }> } | undefined => {
  const words = (search ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length === 0) return undefined;
  return { AND: words.map((word) => ({ OR: fieldsFor(word) })) };
};
