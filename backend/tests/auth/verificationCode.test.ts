import { describe, expect, it } from 'vitest';

import {
  VERIFICATION_CODE_LENGTH,
  generateVerificationCode,
  hashVerificationCode,
  verificationCodeMatches,
} from '../../src/utils/verificationCode';

describe('verification code utilities', () => {
  it('generates zero-padded numeric codes of the configured length', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateVerificationCode()).toMatch(new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`));
    }
  });

  it('does not always produce the same code', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateVerificationCode()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('hashes deterministically and never stores the plaintext', () => {
    const hash = hashVerificationCode('password-reset', 'user-1', '123456');
    expect(hash).toBe(hashVerificationCode('password-reset', 'user-1', '123456'));
    expect(hash).not.toContain('123456');
  });

  it('binds a hash to its purpose and user, so it cannot be replayed elsewhere', () => {
    const hash = hashVerificationCode('password-reset', 'user-1', '123456');
    expect(hashVerificationCode('email-verification', 'user-1', '123456')).not.toBe(hash);
    expect(hashVerificationCode('password-reset', 'user-2', '123456')).not.toBe(hash);
  });

  it('matches only the right code for the right purpose and user', () => {
    const hash = hashVerificationCode('password-reset', 'user-1', '123456');
    expect(verificationCodeMatches('password-reset', 'user-1', '123456', hash)).toBe(true);
    expect(verificationCodeMatches('password-reset', 'user-1', '654321', hash)).toBe(false);
    expect(verificationCodeMatches('email-verification', 'user-1', '123456', hash)).toBe(false);
    expect(verificationCodeMatches('password-reset', 'user-2', '123456', hash)).toBe(false);
  });

  it('rejects a malformed stored hash instead of throwing', () => {
    expect(verificationCodeMatches('password-reset', 'user-1', '123456', 'not-a-hash')).toBe(false);
  });
});
