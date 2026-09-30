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
    .max(50, `${label} is too long.`)
    .regex(PERSON_NAME_PATTERN, `${label} can only contain letters, spaces, hyphens, apostrophes and periods (no numbers).`);
