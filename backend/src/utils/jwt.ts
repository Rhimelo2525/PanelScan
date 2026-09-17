import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from '../config/env';
import type { JwtPayload } from '../types/jwt.types';

export const signToken = (payload: JwtPayload): string => {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, options);
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};
