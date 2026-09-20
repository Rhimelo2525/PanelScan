import { z } from 'zod';

import { passwordSchema } from '../../utils/passwordPolicy';

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

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>['body'];
export type LogoutInput = z.infer<typeof logoutSchema>['body'];
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>['body'];
export type GoogleExchangeInput = z.infer<typeof googleExchangeSchema>['body'];

