import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { env } from '../../src/config/env';
import { authService } from '../../src/modules/auth/auth.service';
import { DISPOSABLE_EMAIL_MESSAGE } from '../../src/utils/disposableEmail';
import { UNDELIVERABLE_EMAIL_MESSAGE, screeningDeps } from '../../src/utils/emailScreening';
import { authHeader, createCustomer, createModerator, createOwner } from '../helpers/factories';
import { mailbox } from '../helpers/mailbox';
import app from '../helpers/testApp';

vi.mock('../../src/utils/mailer', () => ({
  sendMail: (...args: Parameters<typeof mailbox.send>) => mailbox.send(...args),
}));

const TEMP_MAIL_IP = '134.199.179.131';
const original = { ...screeningDeps };
const originalKey = env.ABSTRACT_EMAIL_API_KEY;

// Every test gets its own domain: domains Abstract flags are remembered per process.
let counter = 0;
const uniqueDomain = () => `screen-${Date.now()}-${(counter += 1)}.ph`;

type Mx = { exchange: string }[];
const dns = (mx: Record<string, Mx>, a: Record<string, string[]> = {}) => {
  screeningDeps.resolveMx = vi.fn(async (domain: string) => {
    if (!mx[domain]) throw Object.assign(new Error('no MX'), { code: 'ENODATA' });
    return mx[domain];
  });
  screeningDeps.resolve4 = vi.fn(async (host: string) => a[host] ?? ['203.0.113.10']);
};

const abstractAnswer = (body: unknown, status = 200) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  screeningDeps.fetch = fetchMock;
  return fetchMock;
};
const verdict = (status: string, statusDetail: string, isDisposable = false) => ({
  email_deliverability: { status, status_detail: statusDetail },
  email_quality: { is_disposable: isDisposable },
});

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
const accountExists = async (email: string) => (await prisma.user.count({ where: { email } })) > 0;

beforeEach(() => {
  mailbox.reset();
  env.ABSTRACT_EMAIL_API_KEY = 'test-abstract-key';
  dns({});
  abstractAnswer(verdict('deliverable', 'valid_email'));
});

afterEach(() => {
  Object.assign(screeningDeps, original);
  env.ABSTRACT_EMAIL_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe('Sign-up email screening', () => {
  describe('mail-server check (no API credit used)', () => {
    it('blocks a new domain whose mail server is a known temp-mail server', async () => {
      const domain = uniqueDomain();
      dns({ [domain]: [{ exchange: `mail.${domain}` }] }, { [`mail.${domain}`]: [TEMP_MAIL_IP] });
      const fetchMock = abstractAnswer(verdict('deliverable', 'valid_email'));

      const response = await register(`juan@${domain}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
      expect(await accountExists(`juan@${domain}`)).toBe(false);
      expect(mailbox.messages).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('blocks a domain whose mail is handled by a listed disposable service', async () => {
      const domain = uniqueDomain();
      dns({ [domain]: [{ exchange: 'mx.mailinator.com.' }] });

      const response = await register(`juan@${domain}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
    });

    it('a DNS failure does not block: the address goes on to the API check', async () => {
      const domain = uniqueDomain();
      screeningDeps.resolveMx = vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      });
      const fetchMock = abstractAnswer(verdict('deliverable', 'valid_email'));

      expect((await register(`juan@${domain}`)).status).toBe(201);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Abstract Email Reputation API', () => {
    it('blocks an address Abstract calls disposable, and remembers the domain', async () => {
      const domain = uniqueDomain();
      const fetchMock = abstractAnswer(verdict('undeliverable', 'invalid_mailbox', true));

      const first = await register(`juan@${domain}`);
      expect(first.status).toBe(400);
      expect(first.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
      expect(await accountExists(`juan@${domain}`)).toBe(false);
      expect(mailbox.messages).toHaveLength(0);

      // Another address on the same domain: refused without another paid call.
      const second = await register(`maria@${domain}`);
      expect(second.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('blocks a mailbox that does not exist', async () => {
      const domain = uniqueDomain();
      abstractAnswer(verdict('undeliverable', 'invalid_mailbox'));

      const response = await register(`nobody@${domain}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(UNDELIVERABLE_EMAIL_MESSAGE);
      expect(await accountExists(`nobody@${domain}`)).toBe(false);
    });

    it('does not block answers that can be temporary (full mailbox, server unavailable, unknown)', async () => {
      for (const [status, detail] of [['undeliverable', 'full_mailbox'], ['undeliverable', 'unavailable_server'], ['unknown', 'unknown']] as const) {
        const domain = uniqueDomain();
        abstractAnswer(verdict(status, detail));
        expect((await register(`juan@${domain}`)).status).toBe(201);
      }
    });

    it('allows a deliverable address and sends the verification code as usual', async () => {
      const domain = uniqueDomain();

      const response = await register(`juan@${domain}`);

      expect(response.status).toBe(201);
      expect(mailbox.lastCodeFor(`juan@${domain}`)).toMatch(/^[0-9]{6}$/);
    });

    it('sends the key in a header, never in the URL', async () => {
      const domain = uniqueDomain();
      const fetchMock = abstractAnswer(verdict('deliverable', 'valid_email'));

      await register(`juan@${domain}`);

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`https://emailreputation.abstractapi.com/v1/?email=juan%40${domain}`);
      expect(url).not.toContain('test-abstract-key');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-abstract-key');
    });

    it.each([
      ['quota used up', 422],
      ['invalid key', 401],
      ['rate limited', 429],
      ['server error', 500],
    ])('fails open when Abstract answers %s (%i)', async (_label, status) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      abstractAnswer({ error: { message: 'nope' } }, status);

      expect((await register(`juan@${uniqueDomain()}`)).status).toBe(201);
    });

    it('fails open when Abstract cannot be reached', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      screeningDeps.fetch = vi.fn(async () => {
        throw new TypeError('fetch failed');
      });

      expect((await register(`juan@${uniqueDomain()}`)).status).toBe(201);
    });

    it('without a key, no call is made and sign-up still works (local list + mail-server check only)', async () => {
      env.ABSTRACT_EMAIL_API_KEY = undefined;
      const fetchMock = abstractAnswer(verdict('undeliverable', 'invalid_mailbox', true));

      expect((await register(`juan@${uniqueDomain()}`)).status).toBe(201);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('what is never sent to the API', () => {
    it('mainstream providers skip both checks', async () => {
      const fetchMock = abstractAnswer(verdict('undeliverable', 'invalid_mailbox', true));

      expect((await register(`juan.screen.${Date.now()}@gmail.com`)).status).toBe(201);
      expect(screeningDeps.resolveMx).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('an address that already has an account is answered without a paid call', async () => {
      const { user } = await createCustomer({ email: `taken@${uniqueDomain()}` });
      const fetchMock = abstractAnswer(verdict('deliverable', 'valid_email'));

      expect((await register(user.email)).status).toBe(409);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('an invalid form is refused before any check runs', async () => {
      const fetchMock = abstractAnswer(verdict('deliverable', 'valid_email'));

      const response = await request(app).post('/api/auth/register').send({ ...registration(`juan@${uniqueDomain()}`), password: 'short' });

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screeningDeps.resolveMx).not.toHaveBeenCalled();
    });

    it('a list-known temp-mail address is refused before any network call', async () => {
      const fetchMock = abstractAnswer(verdict('deliverable', 'valid_email'));

      expect((await register('juan@mailinator.com')).body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screeningDeps.resolveMx).not.toHaveBeenCalled();
    });
  });

  describe('Google sign-up', () => {
    const google = (email: string) => ({ sub: `google-${email}`, email, emailVerified: true, firstName: 'Juan', lastName: 'Cruz' });

    it('a new Google account on a temp-mail domain is refused', async () => {
      abstractAnswer(verdict('deliverable', 'valid_email', true));

      await expect(authService.loginWithGoogle(google(`juan@${uniqueDomain()}`))).rejects.toMatchObject({ statusCode: 400, message: DISPOSABLE_EMAIL_MESSAGE });
    });

    it('Google has verified the mailbox, so an "undeliverable" answer does not block it', async () => {
      abstractAnswer(verdict('undeliverable', 'invalid_mailbox'));
      const email = `juan@${uniqueDomain()}`;

      const result = await authService.loginWithGoogle(google(email));
      expect(result.user.email).toBe(email);
    });

    it('an existing account signing in with Google is not screened again', async () => {
      const { user } = await createCustomer({ email: `old@${uniqueDomain()}` });
      const fetchMock = abstractAnswer(verdict('deliverable', 'valid_email', true));

      const result = await authService.loginWithGoogle(google(user.email));
      expect(result.user.id).toBe(user.id);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Owner adding a moderator', () => {
    const addModerator = async (email: string) => {
      const owner = await createOwner();
      return request(app)
        .post('/api/users')
        .set(authHeader(owner.token))
        .send({ firstName: 'Kevin', lastName: 'Santos', email, password: 'P@nelScan2026', role: 'MODERATOR' });
    };

    it('refuses a list-known temp-mail address before any network call', async () => {
      const fetchMock = abstractAnswer(verdict('deliverable', 'valid_email'));

      const response = await addModerator('staff@mailinator.com');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an address Abstract calls disposable', async () => {
      abstractAnswer(verdict('deliverable', 'valid_email', true));
      const email = `staff@${uniqueDomain()}`;

      const response = await addModerator(email);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
      expect(await accountExists(email)).toBe(false);
    });

    it('refuses a mailbox that does not exist', async () => {
      abstractAnswer(verdict('undeliverable', 'invalid_mailbox'));
      const email = `staff@${uniqueDomain()}`;

      const response = await addModerator(email);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(UNDELIVERABLE_EMAIL_MESSAGE);
      expect(await accountExists(email)).toBe(false);
    });

    it('creates the moderator for a deliverable address', async () => {
      const email = `staff@${uniqueDomain()}`;

      const response = await addModerator(email);

      expect(response.status).toBe(201);
      expect(await accountExists(email)).toBe(true);
    });
  });

  describe('Adding an installer', () => {
    const addInstaller = async (email?: string) => {
      const { token } = await createModerator();
      return request(app)
        .post('/api/installers')
        .set(authHeader(token))
        .send({ firstName: 'Mario', lastName: 'Reyes', phone: '+63 912 345 6789', ...(email ? { email } : {}) });
    };
    const installerExists = async (email: string) => (await prisma.installer.count({ where: { email } })) > 0;

    it('refuses a list-known temp-mail address before any network call', async () => {
      const fetchMock = abstractAnswer(verdict('deliverable', 'valid_email'));

      const response = await addInstaller('installer@mailinator.com');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an address Abstract calls disposable', async () => {
      abstractAnswer(verdict('deliverable', 'valid_email', true));
      const email = `installer@${uniqueDomain()}`;

      const response = await addInstaller(email);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(DISPOSABLE_EMAIL_MESSAGE);
      expect(await installerExists(email)).toBe(false);
    });

    it('refuses a mailbox that does not exist', async () => {
      abstractAnswer(verdict('undeliverable', 'invalid_mailbox'));
      const email = `installer@${uniqueDomain()}`;

      const response = await addInstaller(email);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(UNDELIVERABLE_EMAIL_MESSAGE);
      expect(await installerExists(email)).toBe(false);
    });

    it('adds the installer for a deliverable address', async () => {
      const email = `installer@${uniqueDomain()}`;

      const response = await addInstaller(email);

      expect(response.status).toBe(201);
      expect(await installerExists(email)).toBe(true);
    });

    it('email stays optional: no email means no check', async () => {
      const fetchMock = abstractAnswer(verdict('deliverable', 'valid_email'));

      const response = await addInstaller();

      expect(response.status).toBe(201);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
