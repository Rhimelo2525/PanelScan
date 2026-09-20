import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 16;

export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
export const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
export const PASSWORD_NUMBER_REGEX = /[0-9]/;
export const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?/~`\\]/;

// Blocklist of common weak passwords and common root words
const COMMON_WEAK_PASSWORDS = new Set([
  'password1!',
  'password123!',
  'qwerty123!',
  'admin123!',
  'welcome1!',
  'welcome123!',
  'pass1234!',
  'letmein1!',
  'iloveyou1!',
  'changeme1!',
  'testing123!',
  'default123!',
  'monkey123!',
  'dragon123!',
  'master123!',
  'sunshine1!',
  'princess1!',
  'football1!',
  'baseball1!',
  'shadow123!',
  'panelscan1!',
  'panelscan123!',
]);

const COMMON_ROOTS = [
  'password',
  'passcode',
  'qwerty',
  'admin',
  'administrator',
  'welcome',
  'letmein',
  'changeme',
  'default',
  'panelscan',
  'testing',
];

/**
 * Checks whether a password matches known common/weak patterns even if it passes character rules.
 */
export function isCommonPassword(password: string): boolean {
  const normalized = password.toLowerCase().trim();

  if (COMMON_WEAK_PASSWORDS.has(normalized)) {
    return true;
  }

  // Strip numbers and special characters to inspect the alphabetic root
  const alphaRoot = normalized.replace(/[^a-z]/g, '');
  if (alphaRoot && COMMON_ROOTS.includes(alphaRoot)) {
    return true;
  }

  return false;
}

/**
 * Centralized Zod schema for password creation / modification.
 * Enforces:
 * - 8 to 16 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character (!@#$%^&*()_+-= etc.)
 * - No spaces allowed (leading, trailing, or internal)
 * - Blocked common/weak passwords
 */
export const passwordSchema = z
  .string({ required_error: 'Password is required.' })
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`)
  .max(PASSWORD_MAX_LENGTH, `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`)
  .refine((val) => !/\s/.test(val), {
    message: 'Password must not contain spaces.',
  })
  .refine((val) => PASSWORD_UPPERCASE_REGEX.test(val), {
    message: 'Password must contain at least one uppercase letter.',
  })
  .refine((val) => PASSWORD_LOWERCASE_REGEX.test(val), {
    message: 'Password must contain at least one lowercase letter.',
  })
  .refine((val) => PASSWORD_NUMBER_REGEX.test(val), {
    message: 'Password must contain at least one number.',
  })
  .refine((val) => PASSWORD_SPECIAL_REGEX.test(val), {
    message: 'Password must contain at least one special character.',
  })
  .refine((val) => !isCommonPassword(val), {
    message: 'This password is too common or easily guessed. Please choose a stronger password.',
  });
