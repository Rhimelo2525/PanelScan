import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { passwordSchema, isCommonPassword } from '../../src/utils/passwordPolicy';
import app from '../helpers/testApp';

describe('Password Policy & Security Module', () => {
  describe('Zod passwordSchema Unit Tests', () => {
    it('7 characters → FAIL', () => {
      const result = passwordSchema.safeParse('Aa1!bcd');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/at least 8 characters/i);
      }
    });

    it('8 characters with all requirements → PASS', () => {
      const result = passwordSchema.safeParse('Aa1!bcde');
      expect(result.success).toBe(true);
    });

    it('16 characters with all requirements → PASS', () => {
      const result = passwordSchema.safeParse('Aa1!bcdefghijklm');
      expect(result.success).toBe(true);
    });

    it('17 characters → FAIL', () => {
      const result = passwordSchema.safeParse('Aa1!bcdefghijklmn');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/not exceed 16 characters/i);
      }
    });

    it('missing uppercase → FAIL', () => {
      const result = passwordSchema.safeParse('aa1!bcde');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('uppercase'))).toBe(true);
      }
    });

    it('missing lowercase → FAIL', () => {
      const result = passwordSchema.safeParse('AA1!BCDE');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('lowercase'))).toBe(true);
      }
    });

    it('missing number → FAIL', () => {
      const result = passwordSchema.safeParse('Aaa!bcde');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('number'))).toBe(true);
      }
    });

    it('missing special character → FAIL', () => {
      const result = passwordSchema.safeParse('Aaa1bcde');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('special character'))).toBe(true);
      }
    });

    it('password containing leading space → FAIL', () => {
      const result = passwordSchema.safeParse(' Aa1!bcde');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('spaces'))).toBe(true);
      }
    });

    it('password containing internal space → FAIL', () => {
      const result = passwordSchema.safeParse('Aa1! bcde');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('spaces'))).toBe(true);
      }
    });

    it('password containing trailing space → FAIL', () => {
      const result = passwordSchema.safeParse('Aa1!bcde ');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('spaces'))).toBe(true);
      }
    });

    it('common weak passwords (Password1!, Qwerty123!, Admin123!, Welcome1!) → FAIL', () => {
      const weakPasswords = ['Password1!', 'Qwerty123!', 'Admin123!', 'Welcome1!'];
      for (const pwd of weakPasswords) {
        expect(isCommonPassword(pwd)).toBe(true);
        const result = passwordSchema.safeParse(pwd);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some((i) => i.message.includes('too common') || i.message.includes('easily guessed'))).toBe(true);
        }
      }
    });

    it('strong valid password → PASS', () => {
      const result = passwordSchema.safeParse('Pan3l$can2026');
      expect(result.success).toBe(true);
    });
  });

  describe('Confirm Password Validation', () => {
    function validateConfirmPassword(password: string, confirmPassword: string) {
      if (!confirmPassword) return { isValid: false, error: 'Confirm your password.' };
      if (confirmPassword !== password) return { isValid: false, error: 'Passwords do not match.' };
      return { isValid: true };
    }

    it('confirm password mismatch → FAIL', () => {
      const res = validateConfirmPassword('Pan3l$can2026', 'Different123!');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Passwords do not match.');
    });

    it('confirm password match → PASS', () => {
      const res = validateConfirmPassword('Pan3l$can2026', 'Pan3l$can2026');
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });
  });

  describe('API Enforcement (Bypassing Frontend Validation)', () => {
    it('API attempt bypassing frontend validation with 7-char password → FAIL (400)', async () => {
      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Hacker',
        lastName: 'Bypass',
        email: 'bypass.short@panelscan.test',
        password: 'Aa1!bcd',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(JSON.stringify(response.body.errors)).toMatch(/at least 8 characters/i);
    });

    it('API attempt bypassing frontend validation with spaces → FAIL (400)', async () => {
      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Hacker',
        lastName: 'Bypass',
        email: 'bypass.space@panelscan.test',
        password: 'Aa1! bcde',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(JSON.stringify(response.body.errors)).toMatch(/spaces/i);
    });

    it('API attempt with common password Password1! → FAIL (400)', async () => {
      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Common',
        lastName: 'User',
        email: 'common.pwd@panelscan.test',
        password: 'Password1!',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(JSON.stringify(response.body.errors)).toMatch(/too common|easily guessed/i);
    });

    it('API registration with strong valid password → PASS (201)', async () => {
      const email = `strong.${Date.now()}@panelscan.test`;
      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Valid',
        lastName: 'Secure',
        email,
        password: 'Pan3l$can2026',
        phone: '09123456789',
        acceptedTerms: true,
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(email);
      expect(response.body.data.user.role).toBe('CUSTOMER');
      expect(response.body.data.user.password).toBeUndefined();
    });
  });
});
