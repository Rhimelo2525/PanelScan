import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long.'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),

  // PayMongo (Payment module). Optional at the process level - unlike
  // DATABASE_URL/JWT_SECRET, no other module depends on these, so a missing
  // key shouldn't block the whole server from booting. payment.service.ts
  // checks for PAYMONGO_SECRET_KEY itself and fails only the payment
  // creation request (500) if it's absent.
  PAYMONGO_SECRET_KEY: z.string().optional(),
  PAYMONGO_WEBHOOK_SECRET: z.string().optional(),
  PAYMONGO_API_URL: z.string().url().default('https://api.paymongo.com/v1'),
  PAYMENT_SUCCESS_URL: z.string().url().default('http://localhost:3000/payment/success'),
  PAYMENT_CANCEL_URL: z.string().url().default('http://localhost:3000/payment/cancel'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('\n❌ Invalid or missing environment variables:');
  for (const issue of parsedEnv.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = typeof env;
