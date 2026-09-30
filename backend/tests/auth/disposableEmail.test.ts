import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { authService } from '../../src/modules/auth/auth.service';
import { DISPOSABLE_EMAIL_MESSAGE, emailDomain, isDisposableEmail } from '../../src/utils/disposableEmail';
import { mailbox } from '../helpers/mailbox';
import app from '../helpers/testApp';

vi.mock('../../src/utils/mailer', () => ({
  sendMail: (...args: Parameters<typeof mailbox.send>) => mailbox.send(...args),
}));

beforeEach(() => mailbox.reset());

const registration = (email: string) => ({
  firstName: 'Justin',
  lastName: 'Ablog',
  email,
  password: 'P@nelScan2026',
  phone: '+63 912 345 6789',
  birthdate: '1995-06-15',
  acceptedTerms: true,
});

const register = (email: string) => request(app).post('/api/auth/register').send(registration(email));

const VALID = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'proton.me', 'disenyo-interiors.ph'];
const DISPOSABLE = [
  'temp-mail.org',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'sharklasers.com',
  'mailinator.com',
  'yopmail.com',
  'yopmail.fr',
  'trashmail.com',
  'maildrop.cc',
  'dispostable.com',
  'getnada.com',
  'mail.tm',
  'minuteinbox.com',
];

describe('Disposable email detection', () => {
  it.each(VALID)('allows %s', (domain) => {
    expect(isDisposableEmail(`someone@${domain}`)).toBe(false);
  });

  it.each(DISPOSABLE)('blocks %s', (domain) => {
    expect(isDisposableEmail(`someone@${domain}`)).toBe(true);
  });

  it('ignores case, surrounding spaces and a trailing dot', () => {
    expect(isDisposableEmail('  Someone@MailInator.COM  ')).toBe(true);
    expect(isDisposableEmail('someone@yopmail.com.')).toBe(true);
    expect(isDisposableEmail('  Juan.DelaCruz@GMAIL.com ')).toBe(false);
  });

  it('blocks subdomains of a disposable domain', () => {
    expect(isDisposableEmail('someone@inbox.mailinator.com')).toBe(true);
  });

  it('does not let a legitimate-looking prefix hide a disposable domain', () => {
    expect(isDisposableEmail('someone@gmail.com.mailinator.com')).toBe(true);
  });

  it('keeps privacy-alias services that forward to a permanent inbox', () => {
    expect(isDisposableEmail('alias@passmail.net')).toBe(false);
    expect(isDisposableEmail('alias@duck.com')).toBe(false);
  });

  it('has no domain for a malformed address', () => {
    expect(emailDomain('no-at-sign')).toBeNull();
    expect(emailDomain('someone@')).toBeNull();
    expect(emailDomain('@mailinator.com')).toBeNull();
    expect(emailDomain('someone@localhost')).toBeNull();
  });
});

describe('POST /api/auth/register with a disposable email', () => {
  it.each(DISPOSABLE)('rejects %s: no account, no verification code, no email', async (domain) => {
    const email = `blocked@${domain}`;

    const response = await register(email);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: DISPOSABLE_EMAIL_MESSAGE });
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(await prisma.emailVerificationCode.count()).toBe(0);
    expect(mailbox.messages).toHaveLength(0);
  });

  it('rejects an upper-case address wrapped in spaces', async () => {
    const response = await register('  Blocked.User@MAILINATOR.COM ');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
    expect(await prisma.user.count({ where: { email: 'blocked.user@mailinator.com' } })).toBe(0);
    expect(mailbox.messages).toHaveLength(0);
  });

  it('rejects a subdomain of a disposable service', async () => {
    const response = await register('blocked@inbox.mailinator.com');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
    expect(await prisma.user.count({ where: { email: 'blocked@inbox.mailinator.com' } })).toBe(0);
  });

  it('gives the same answer whether or not the address already has an account', async () => {
    // A legacy row created before the rule existed must not be revealed.
    await prisma.user.create({ data: { firstName: 'Legacy', lastName: 'User', email: 'legacy@yopmail.com', role: 'CUSTOMER' } });

    const response = await register('legacy@yopmail.com');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
  });

  it('rejects a malformed address before anything else', async () => {
    const response = await register('not-an-email@');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Validation failed.');
    expect(mailbox.messages).toHaveLength(0);
  });

  it('does not create a Google account for a disposable address', async () => {
    const profile = { sub: 'google-disposable', email: 'someone@mailinator.com', emailVerified: true, firstName: 'Temp', lastName: 'User' };

    await expect(authService.loginWithGoogle(profile)).rejects.toMatchObject({ statusCode: 400, message: DISPOSABLE_EMAIL_MESSAGE });
    expect(await prisma.user.count({ where: { email: 'someone@mailinator.com' } })).toBe(0);
  });
});

describe('POST /api/auth/register with a permanent email', () => {
  it.each(VALID)('registers a %s address and emails a verification code', async (domain) => {
    const email = `valid.user@${domain}`;

    const response = await register(`  Valid.User@${domain.toUpperCase()} `);

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user.emailVerified).toBe(false);
    expect(mailbox.to(email)).toHaveLength(1);
    // The code only ever travels by email.
    expect(JSON.stringify(response.body)).not.toContain(mailbox.lastCodeFor(email));
  });

  it('completes the normal flow: register, verify once, then log in', async () => {
    const email = 'full.flow@gmail.com';
    const registered = await register(email);
    const token = registered.body.data.token as string;
    const code = mailbox.lastCodeFor(email);

    // Asking again straight away is refused by the resend cooldown - no second email.
    const resend = await request(app).post('/api/auth/send-verification-email').set('Authorization', `Bearer ${token}`);
    expect(resend.status).toBe(429);
    expect(mailbox.to(email)).toHaveLength(1);

    const verified = await request(app).post('/api/auth/verify-email').set('Authorization', `Bearer ${token}`).send({ code });
    expect(verified.status).toBe(200);
    expect(verified.body.data.user.emailVerified).toBe(true);
    expect(await prisma.emailVerificationCode.count()).toBe(0);

    const login = await request(app).post('/api/auth/login').send({ email, password: 'P@nelScan2026' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.emailVerified).toBe(true);
  });

  it('does not accept an expired registration code', async () => {
    const email = 'expired.code@outlook.com';
    const registered = await register(email);
    const code = mailbox.lastCodeFor(email);
    await prisma.emailVerificationCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await request(app)
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${registered.body.data.token as string}`)
      .send({ code });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('The code is invalid or has expired.');
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(false);
  });
});
