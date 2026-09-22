import { z } from 'zod';

import { passwordSchema } from '../../utils/passwordPolicy';

const BIRTHDATE_MIN_YEAR = 1900;

/**
 * A real calendar date in "YYYY-MM-DD" form, not before 1900 and not in the
 * future. The upper bound allows a day of slack past the server's UTC date so
 * a customer whose local date is already "tomorrow" (e.g. UTC+8 after
 * midnight) isn't rejected for entering their own today.
 */
const isValidBirthdate = (value: string): boolean => {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isRealDate || year < BIRTHDATE_MIN_YEAR) return false;

  const latestAllowed = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return value <= latestAllowed;
};

const birthdateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please provide a valid birthdate.')
  .refine(isValidBirthdate, { message: 'Please provide a valid birthdate that is not in the future.' });

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s\-()]{7,20}$/, 'Please provide a valid phone number.');

const emailSchema = z.string().trim().toLowerCase().email('Please provide a valid email address.');

const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Please enter the 6-digit code.');

export const registerSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(2, 'First name must be at least 2 characters.').max(50, 'First name is too long.'),
    lastName: z.string().trim().min(2, 'Last name must be at least 2 characters.').max(50, 'Last name is too long.'),
    email: z.string().trim().toLowerCase().email('Please provide a valid email address.'),
    password: passwordSchema,
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s\-()]{7,20}$/, 'Please provide a valid phone number.')
      .optional(),
    birthdate: birthdateSchema.optional(),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must agree to the Terms of Use and Privacy Policy before creating an account.' }),
    }),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Please provide a valid email address.'),
    password: z.string().min(1, 'Password is required.'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required.'),
  }),
});

export const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required.'),
  }),
});

export const googleAuthSchema = z.object({
  body: z
    .object({
      credential: z.string().optional(),
      code: z.string().optional(),
      acceptedTerms: z.boolean().optional(),
    })
    .refine((data) => Boolean(data.credential || data.code), {
      message: 'Either credential or authorization code is required.',
      path: ['credential'],
    }),
});

export const googleExchangeSchema = z.object({
  body: z.object({
    ticket: z.string().min(1, 'Exchange ticket is required.'),
  }),
});

// Customer self-service profile edit (PATCH /api/auth/me). Every field is
// optional so a partial save works, but at least one must be present. `email`
// is intentionally not accepted - unknown keys are stripped, so a client that
// sends one gets no change rather than a silent identity swap. `birthdate` and
// `address` accept null (and "" for address) to clear a previously saved value.
export const updateProfileSchema = z.object({
  body: z
    .object({
      firstName: z.string().trim().min(2, 'First name must be at least 2 characters.').max(50, 'First name is too long.').optional(),
      lastName: z.string().trim().min(2, 'Last name must be at least 2 characters.').max(50, 'Last name is too long.').optional(),
      phone: phoneSchema.optional(),
      birthdate: birthdateSchema.nullable().optional(),
      address: z
        .string()
        .trim()
        .max(255, 'Address must not exceed 255 characters.')
        .transform((value) => (value === '' ? null : value))
        .nullable()
        .optional(),
    })
    .refine((data) => Object.values(data).some((value) => value !== undefined), { message: 'At least one field must be provided.' }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, 'Current password is required.'),
      newPassword: passwordSchema,
      confirmPassword: z.string().min(1, 'Please confirm your new password.'),
      // The refresh token of the device making the request, so changing the
      // password signs out every OTHER session but not this one.
      refreshToken: z.string().min(1).optional(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      message: 'Your new password must be different from your current password.',
      path: ['newPassword'],
    }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({ email: emailSchema }),
});

export const verifyResetCodeSchema = z.object({
  body: z.object({ email: emailSchema, code: verificationCodeSchema }),
});

export const resetPasswordSchema = z.object({
  body: z
    .object({
      email: emailSchema,
      code: verificationCodeSchema,
      newPassword: passwordSchema,
      confirmPassword: z.string().min(1, 'Please confirm your new password.'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    }),
});

export const verifyEmailSchema = z.object({
  body: z.object({ code: verificationCodeSchema }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type VerifyResetCodeInput = z.infer<typeof verifyResetCodeSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>['body'];
export type LogoutInput = z.infer<typeof logoutSchema>['body'];
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>['body'];
export type GoogleExchangeInput = z.infer<typeof googleExchangeSchema>['body'];

