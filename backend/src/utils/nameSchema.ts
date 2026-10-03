import { z } from 'zod';

/**
 * A person's first or last name: letters (any language, so ñ and accents are
 * fine) plus the separators real names use - spaces, hyphens, apostrophes and
 * periods ("Ma. Cristina", "Dela Cruz", "O'Neil"). Numbers and other symbols
 * are rejected. Must start with a letter.
 */
export const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M} .'-]*$/u;

export const personNameSchema = (label: 'First name' | 'Last name') =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(2, `${label} must be at least 2 characters.`)
    .max(35, `${label} must not exceed 35 characters.`)
    .regex(PERSON_NAME_PATTERN, `${label} can only contain letters, spaces, hyphens, apostrophes and periods (no numbers).`);

/**
 * A name as typed on Create Account and staff forms: strict about spaces
 * instead of quietly trimming them. Single spaces between words are fine
 * ("Dela Cruz"); leading, trailing or doubled ones are refused.
 */
const hasTidySpaces = (value: string): boolean => value === value.trim() && !/\s{2}/.test(value);

export const tidyPersonNameSchema = (label: 'First name' | 'Last name') =>
  z
    .string({ required_error: `${label} is required.` })
    .refine(hasTidySpaces, `${label} cannot start or end with a space, or have double spaces.`)
    .pipe(personNameSchema(label));

/**
 * "M", "M.", "m" or "D. C." (compound middle name): 1-3 letters, with periods
 * and spaces only as separators. Stored as the bare letters ("M", "DC").
 */
export const middleInitialSchema = z
  .string()
  .trim()
  .refine((value) => /^(\p{L}\.?\s?){1,3}$/u.test(value), 'Enter a middle initial using letters only (e.g. M or M.).')
  .transform((value) => value.replace(/[.\s]/g, '').toUpperCase());

/** Optional middle initial on a create form: no spaces, and an empty value means none. */
export const optionalMiddleInitialSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().refine((value) => !/\s/.test(value), 'Middle initial cannot contain spaces.').pipe(middleInitialSchema).optional(),
);
