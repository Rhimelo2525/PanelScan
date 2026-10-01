import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { mailbox } from '../helpers/mailbox';
import app from '../helpers/testApp';

vi.mock('../../src/utils/mailer', () => ({
  sendMail: (...args: Parameters<typeof mailbox.send>) => mailbox.send(...args),
}));

beforeEach(() => mailbox.reset());

const valid = {
  firstName: 'Juan',
  middleInitial: 'M',
  lastName: 'Dela Cruz',
  email: 'juan.spaces@gmail.com',
  password: 'P@nelScan2026',
  phone: '+639123456789',
  birthdate: '1995-06-15',
  acceptedTerms: true,
};

const register = (overrides: Partial<Record<keyof typeof valid, unknown>>) =>
  request(app).post('/api/auth/register').send({ ...valid, ...overrides });

describe('Create Account rejects disallowed spaces (direct API calls)', () => {
  it.each([
    ['email', ' juan.spaces@gmail.com', 'Email address cannot contain spaces.'],
    ['email', 'juan.spaces@gmail.com ', 'Email address cannot contain spaces.'],
    ['email', 'juan spaces@gmail.com', 'Email address cannot contain spaces.'],
    ['middleInitial', 'D C', 'Middle initial cannot contain spaces.'],
    ['middleInitial', ' M', 'Middle initial cannot contain spaces.'],
    ['birthdate', ' 1995-06-15', 'Birthdate cannot contain spaces.'],
    ['firstName', ' Juan', 'First name cannot start or end with a space, or have double spaces.'],
    ['firstName', 'Juan ', 'First name cannot start or end with a space, or have double spaces.'],
    ['lastName', 'Dela  Cruz', 'Last name cannot start or end with a space, or have double spaces.'],
    ['password', ' P@nelScan2026', 'Password must not contain spaces.'],
    ['password', 'P@nel Scan2026', 'Password must not contain spaces.'],
  ] as const)('%s %j is rejected and no account is created', async (field, value, message) => {
    const response = await register({ [field]: value });

    expect(response.status).toBe(400);
    expect(response.body.errors.map((error: { message: string }) => error.message)).toContain(message);
    expect(await prisma.user.count({ where: { email: { contains: 'juan' } } })).toBe(0);
    expect(mailbox.messages).toHaveLength(0);
  });

  it('accepts a clean registration: single spaces inside names, no spaces elsewhere', async () => {
    const response = await register({ firstName: 'Ma. Cristina', lastName: 'Dela Cruz', middleInitial: 'D.C.' });

    expect(response.status).toBe(201);
    expect(response.body.data.user.firstName).toBe('Ma. Cristina');
    expect(response.body.data.user.lastName).toBe('Dela Cruz');
    expect(response.body.data.user.middleInitial).toBe('DC');
    expect(mailbox.to('juan.spaces@gmail.com')).toHaveLength(1);
  });

  it('accepts john123-style values with no spaces (e.g. the email local part)', async () => {
    const response = await register({ email: 'john123@gmail.com' });
    expect(response.status).toBe(201);
  });
});
