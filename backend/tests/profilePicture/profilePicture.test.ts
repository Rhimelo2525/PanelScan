import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { authHeader, createCustomer, createModerator, createOwner } from '../helpers/factories';
import app from '../helpers/testApp';

// The feature writes real files. tests/setupEnv.ts has already pointed
// UPLOAD_DIR at a throwaway temp folder for the whole run, so nothing here can
// touch the real backend/uploads directory.
const uploadDir = process.env.UPLOAD_DIR as string;

// On Windows an open file handle blocks deleting the file, and libvips caches
// them by default - which would make the per-test cleanup below fail with EPERM.
sharp.cache(false);

const MB = 1024 * 1024;
const STORED_PATH = /^profiles\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

afterEach(() => {
  fs.rmSync(uploadDir, { recursive: true, force: true });
});
afterAll(() => {
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- fixtures

type Format = 'jpeg' | 'png' | 'webp';

const makeImage = async (format: Format = 'jpeg', width = 800, height = 600): Promise<Buffer> => {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } });
  if (format === 'png') return base.png().toBuffer();
  if (format === 'webp') return base.webp().toBuffer();
  return base.jpeg().toBuffer();
};

const upload = (token: string, file: Buffer, filename = 'me.jpg', contentType = 'image/jpeg') =>
  request(app).put('/api/auth/me/profile-picture').set(authHeader(token)).attach('image', file, { filename, contentType });

const storedFiles = (userId: string): string[] => {
  const directory = path.join(uploadDir, 'profiles', userId);
  return fs.existsSync(directory) ? fs.readdirSync(directory) : [];
};

const dbState = (userId: string) =>
  prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { profilePicturePath: true, profilePictureUpdatedAt: true } });

const logsFor = (userId: string) => prisma.activityLog.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

/** Fetches a picture over HTTP the way the web app does. */
const view = (token: string, url: string) =>
  request(app)
    .get(`/api${url}`)
    .set(authHeader(token))
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });

describe('Customer profile picture', () => {
  // ------------------------------------------------------------ uploading

  describe('PUT /api/auth/me/profile-picture', () => {
    it('stores a JPEG as a 512x512 WebP under a server-generated name and returns the updated user', async () => {
      const { token, user } = await createCustomer({ email: 'pp-jpeg@panelscan.test' });

      const response = await upload(token, await makeImage('jpeg'));

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Profile picture updated successfully.');
      const returned = response.body.data.user;
      expect(returned.profilePictureUrl).toMatch(new RegExp(`^/users/${user.id}/profile-picture\\?v=\\d+$`));
      expect(returned.profilePictureUpdatedAt).toBeTruthy();
      // The internal storage path is never exposed.
      expect(returned.profilePicturePath).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('profiles/');

      const state = await dbState(user.id);
      expect(state.profilePicturePath).toMatch(STORED_PATH);
      expect(state.profilePicturePath!.split('/')[1]).toBe(user.id);
      expect(state.profilePictureUpdatedAt).not.toBeNull();

      const file = path.join(uploadDir, ...state.profilePicturePath!.split('/'));
      expect(fs.existsSync(file)).toBe(true);
      const meta = await sharp(fs.readFileSync(file)).metadata();
      expect(meta.format).toBe('webp');
      expect([meta.width, meta.height]).toEqual([512, 512]);
    });

    it.each<Format>(['png', 'webp'])('accepts a %s upload', async (format) => {
      const { token, user } = await createCustomer({ email: `pp-${format}@panelscan.test` });

      const response = await upload(token, await makeImage(format), `photo.${format}`, `image/${format}`);

      expect(response.status).toBe(200);
      expect(storedFiles(user.id)).toHaveLength(1);
    });

    it('crops a non-square photo to a centred square', async () => {
      const { token, user } = await createCustomer({ email: 'pp-crop@panelscan.test' });
      // Left half blue, right half red: a centred square crop of a wide image keeps the middle.
      const wide = await sharp({ create: { width: 1000, height: 250, channels: 3, background: { r: 255, g: 0, b: 0 } } })
        .composite([{ input: { create: { width: 500, height: 250, channels: 3, background: { r: 0, g: 0, b: 255 } } }, left: 0, top: 0 }])
        .jpeg()
        .toBuffer();

      await upload(token, wide);

      const { profilePicturePath } = await dbState(user.id);
      const stored = sharp(fs.readFileSync(path.join(uploadDir, ...profilePicturePath!.split('/'))));
      const { data, info } = await stored.raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height]).toEqual([512, 512]);
      const pixel = (x: number, y: number) => ({ r: data[(y * info.width + x) * info.channels]!, b: data[(y * info.width + x) * info.channels + 2]! });
      // The crop window is the middle 250px (x 375-625), so the blue/red seam lands mid-image.
      expect(pixel(100, 256).b).toBeGreaterThan(pixel(100, 256).r);
      expect(pixel(400, 256).r).toBeGreaterThan(pixel(400, 256).b);
    });

    it('strips EXIF metadata, including GPS location', async () => {
      const { token, user } = await createCustomer({ email: 'pp-exif@panelscan.test' });
      const withGps = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 10, g: 20, b: 30 } } })
        .withExif({
          IFD0: { Copyright: 'Private Person' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '14/1 35/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '121/1 0/1 0/1' },
        })
        .jpeg()
        .toBuffer();
      expect((await sharp(withGps).metadata()).exif).toBeDefined();

      const response = await upload(token, withGps);

      expect(response.status).toBe(200);
      const { profilePicturePath } = await dbState(user.id);
      const stored = fs.readFileSync(path.join(uploadDir, ...profilePicturePath!.split('/')));
      expect((await sharp(stored).metadata()).exif).toBeUndefined();
      expect(stored.toString('latin1')).not.toContain('Private Person');
    });

    it('replaces an existing picture: new file, old file deleted, exactly one left', async () => {
      const { token, user } = await createCustomer({ email: 'pp-replace@panelscan.test' });
      await upload(token, await makeImage('jpeg'));
      const first = (await dbState(user.id)).profilePicturePath;
      const firstVersion = (await dbState(user.id)).profilePictureUpdatedAt;

      const response = await upload(token, await makeImage('png', 300, 300), 'new.png', 'image/png');

      expect(response.status).toBe(200);
      const second = (await dbState(user.id)).profilePicturePath;
      expect(second).not.toBe(first);
      expect(fs.existsSync(path.join(uploadDir, ...first!.split('/')))).toBe(false);
      expect(storedFiles(user.id)).toEqual([second!.split('/')[2]]);
      expect((await dbState(user.id)).profilePictureUpdatedAt!.getTime()).toBeGreaterThanOrEqual(firstVersion!.getTime());
    });

    it('ignores any customer id sent by the client and only ever changes the caller', async () => {
      const attacker = await createCustomer({ email: 'pp-attacker@panelscan.test' });
      const victim = await createCustomer({ email: 'pp-victim@panelscan.test' });

      const response = await request(app)
        .put(`/api/auth/me/profile-picture?userId=${victim.user.id}&customerId=${victim.user.id}`)
        .set(authHeader(attacker.token))
        .field('userId', victim.user.id)
        .field('customerId', victim.user.id)
        .attach('image', await makeImage(), { filename: 'x.jpg', contentType: 'image/jpeg' });

      expect(response.status).toBe(200);
      expect((await dbState(attacker.user.id)).profilePicturePath).not.toBeNull();
      expect((await dbState(victim.user.id)).profilePicturePath).toBeNull();
      expect(storedFiles(victim.user.id)).toHaveLength(0);
    });

    it('uses a server-generated file name whatever the client calls the file', async () => {
      const { token, user } = await createCustomer({ email: 'pp-names@panelscan.test' });

      for (const hostile of ['../../evil.jpg', '..\\..\\evil.jpg', '/etc/passwd.jpg', 'a/b/c.png', 'nul\u0000.jpg']) {
        const response = await upload(token, await makeImage(), hostile, 'image/jpeg');
        expect([200, 400]).toContain(response.status);
      }

      // Whatever was accepted, the only thing on disk is one server-named file in the caller's own folder.
      const allFiles = fs.readdirSync(uploadDir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
      expect(allFiles.length).toBeLessThanOrEqual(1);
      for (const entry of allFiles) {
        expect(path.relative(uploadDir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')).toMatch(STORED_PATH);
        expect(entry.parentPath.endsWith(user.id)).toBe(true);
      }
    });

    it('records an audit entry with the user, action, time, IP address and user agent', async () => {
      const { token, user } = await createCustomer({ email: 'pp-audit@panelscan.test' });

      await request(app)
        .put('/api/auth/me/profile-picture')
        .set(authHeader(token))
        .set('User-Agent', 'PanelScan-Test-Agent/1.0')
        .attach('image', await makeImage(), { filename: 'a.jpg', contentType: 'image/jpeg' });
      await request(app)
        .put('/api/auth/me/profile-picture')
        .set(authHeader(token))
        .attach('image', await makeImage(), { filename: 'b.jpg', contentType: 'image/jpeg' });

      const [first, second] = await logsFor(user.id);
      expect(first?.action).toBe('PROFILE_PICTURE_UPDATED');
      expect(first?.userId).toBe(user.id);
      expect(first?.ipAddress).toBeTruthy();
      expect(first?.userAgent).toBe('PanelScan-Test-Agent/1.0');
      expect(first?.createdAt).toBeInstanceOf(Date);
      expect(first?.metadata).toMatchObject({ replaced: false });
      expect(second?.metadata).toMatchObject({ replaced: true });
    });
  });

  // ---------------------------------------------------- rejecting bad uploads

  describe('rejecting bad uploads', () => {
    /** A rejected upload must leave no trace: no path saved, no file on disk, no audit entry. */
    const expectNothingStored = async (userId: string) => {
      expect((await dbState(userId)).profilePicturePath).toBeNull();
      expect(storedFiles(userId)).toHaveLength(0);
      expect(await logsFor(userId)).toHaveLength(0);
    };

    it('rejects a request with no file', async () => {
      const { token, user } = await createCustomer({ email: 'pp-nofile@panelscan.test' });

      const multipartWithoutFile = await request(app).put('/api/auth/me/profile-picture').set(authHeader(token)).field('note', 'hi');
      const jsonBody = await request(app).put('/api/auth/me/profile-picture').set(authHeader(token)).send({ image: 'nope' });

      for (const response of [multipartWithoutFile, jsonBody]) {
        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Please choose an image to upload.');
      }
      await expectNothingStored(user.id);
    });

    it.each([
      ['a PDF', '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'resume.pdf', 'application/pdf'],
      ['a PDF disguised as a .jpg', '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'photo.jpg', 'image/jpeg'],
      ['a Windows executable', 'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00', 'setup.exe', 'application/x-msdownload'],
      ['an executable disguised as a .png', 'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00', 'photo.png', 'image/png'],
      ['a script disguised as a .jpg', '<?php system($_GET["c"]); ?>', 'avatar.jpg', 'image/jpeg'],
      ['an SVG', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'logo.svg', 'image/svg+xml'],
      ['an HTML file disguised as a .webp', '<html><script>alert(1)</script></html>', 'photo.webp', 'image/webp'],
      ['a text file with a real image extension', 'just some text, not an image at all', 'photo.png', 'image/png'],
    ])('rejects %s', async (_label, content, filename, contentType) => {
      const { token, user } = await createCustomer({ email: `pp-bad-${Math.random().toString(36).slice(2, 8)}@panelscan.test` });

      const response = await upload(token, Buffer.from(content, 'latin1'), filename, contentType);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Please upload a JPG, PNG, or WEBP image.');
      await expectNothingStored(user.id);
    });

    it.each([
      ['GIF', async () => sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).gif().toBuffer(), 'anim.gif', 'image/gif'],
      ['BMP-named JPEG', async () => makeImage('jpeg'), 'photo.bmp', 'image/bmp'],
      ['image with no extension', async () => makeImage('jpeg'), 'photo', 'image/jpeg'],
    ])('rejects an unsupported format or extension: %s', async (_label, build, filename, contentType) => {
      const { token, user } = await createCustomer({ email: `pp-ext-${Math.random().toString(36).slice(2, 8)}@panelscan.test` });

      const response = await upload(token, await build(), filename, contentType);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Please upload a JPG, PNG, or WEBP image.');
      await expectNothingStored(user.id);
    });

    it('rejects an image over 5MB with a clear message and stores nothing', async () => {
      const { token, user } = await createCustomer({ email: 'pp-big@panelscan.test' });
      const oversized = Buffer.concat([await makeImage('jpeg'), Buffer.alloc(5 * MB + 1024)]);

      const response = await upload(token, oversized);

      expect(response.status).toBe(413);
      expect(response.body.message).toBe('Image size must be less than 5MB.');
      await expectNothingStored(user.id);
    });

    it('rejects a corrupted image that merely starts like a real one', async () => {
      const { token, user } = await createCustomer({ email: 'pp-corrupt@panelscan.test' });
      // Random pixels don't compress, so the JPEG is big enough to truncate meaningfully.
      const noisy = await sharp(randomBytes(600 * 600 * 3), { raw: { width: 600, height: 600, channels: 3 } }).jpeg().toBuffer();
      const truncated = noisy.subarray(0, Math.floor(noisy.length / 3));

      const jpeg = await upload(token, truncated, 'cut.jpg', 'image/jpeg');
      const garbage = await upload(token, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(256, 7)]), 'junk.jpg', 'image/jpeg');
      const badPng = await upload(token, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]), 'junk.png', 'image/png');

      for (const response of [jpeg, garbage, badPng]) {
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("couldn't read that image");
      }
      await expectNothingStored(user.id);
    });

    it('rejects an image whose pixel dimensions are absurdly large (decompression bomb) without decoding it', async () => {
      const { token, user } = await createCustomer({ email: 'pp-bomb@panelscan.test' });
      // ~42 megapixels of flat colour (limit is 40): tiny on the wire, enormous once decoded.
      const bomb = await sharp({ create: { width: 6500, height: 6500, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      expect(bomb.length).toBeLessThan(5 * MB);

      const response = await upload(token, bomb, 'bomb.png', 'image/png');

      expect(response.status).toBe(400);
      await expectNothingStored(user.id);
    });

    it('keeps the existing picture when a replacement is rejected', async () => {
      const { token, user } = await createCustomer({ email: 'pp-keep@panelscan.test' });
      await upload(token, await makeImage('jpeg'));
      const before = await dbState(user.id);

      const response = await upload(token, Buffer.from('%PDF-1.7 not an image'), 'x.pdf', 'application/pdf');

      expect(response.status).toBe(400);
      expect(await dbState(user.id)).toEqual(before);
      expect(storedFiles(user.id)).toHaveLength(1);
    });

    it('reports a storage failure as 503 and changes nothing', async () => {
      const { token, user } = await createCustomer({ email: 'pp-storage@panelscan.test' });
      // A regular file where the "profiles" folder should be makes the folder impossible to create.
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, 'profiles'), 'in the way');

      const response = await upload(token, await makeImage());

      expect(response.status).toBe(503);
      expect(response.body.message).toContain("couldn't save your photo");
      expect((await dbState(user.id)).profilePicturePath).toBeNull();
      expect(await logsFor(user.id)).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------- removing

  describe('DELETE /api/auth/me/profile-picture', () => {
    it('removes the picture: database cleared, file and folder deleted, audit recorded', async () => {
      const { token, user } = await createCustomer({ email: 'pp-remove@panelscan.test' });
      await upload(token, await makeImage());

      const response = await request(app).delete('/api/auth/me/profile-picture').set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.data.user.profilePictureUrl).toBeNull();
      expect(await dbState(user.id)).toEqual({ profilePicturePath: null, profilePictureUpdatedAt: null });
      expect(fs.existsSync(path.join(uploadDir, 'profiles', user.id))).toBe(false);
      expect((await logsFor(user.id)).map((log) => log.action)).toEqual(['PROFILE_PICTURE_UPDATED', 'PROFILE_PICTURE_REMOVED']);
    });

    it('is idempotent: removing when there is no picture succeeds and writes no audit entry', async () => {
      const { token, user } = await createCustomer({ email: 'pp-remove-none@panelscan.test' });

      const response = await request(app).delete('/api/auth/me/profile-picture').set(authHeader(token));

      expect(response.status).toBe(200);
      expect(await logsFor(user.id)).toHaveLength(0);
    });

    it("cannot touch another customer's picture", async () => {
      const owner = await createCustomer({ email: 'pp-own@panelscan.test' });
      const other = await createCustomer({ email: 'pp-other@panelscan.test' });
      await upload(owner.token, await makeImage());

      await request(app).delete('/api/auth/me/profile-picture').set(authHeader(other.token));

      expect((await dbState(owner.user.id)).profilePicturePath).not.toBeNull();
      expect(storedFiles(owner.user.id)).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------- viewing

  describe('GET /api/users/:id/profile-picture', () => {
    const uploadedCustomer = async (email: string) => {
      const created = await createCustomer({ email });
      const response = await upload(created.token, await makeImage());
      return { ...created, url: response.body.data.user.profilePictureUrl as string };
    };

    it('lets the owner view their picture, as a cacheable private WebP', async () => {
      const { token, url } = await uploadedCustomer('pp-view@panelscan.test');

      const response = await view(token, url);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      const bytes = response.body as Buffer;
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
    });

    it('revalidates instead of caching forever when the version in the URL is missing or stale', async () => {
      const { token, user } = await uploadedCustomer('pp-stale@panelscan.test');

      const noVersion = await view(token, `/users/${user.id}/profile-picture`);
      const stale = await view(token, `/users/${user.id}/profile-picture?v=1`);

      for (const response of [noVersion, stale]) {
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('private, no-cache');
      }
    });

    it('answers a conditional request with 304 (ETag)', async () => {
      const { token, url } = await uploadedCustomer('pp-etag@panelscan.test');
      const first = await view(token, url);

      const second = await request(app).get(`/api${url}`).set(authHeader(token)).set('If-None-Match', first.headers.etag as string);

      expect(first.headers.etag).toBeTruthy();
      expect(second.status).toBe(304);
    });

    it('persists across a reload: GET /me still reports the picture', async () => {
      const { token, url } = await uploadedCustomer('pp-persist@panelscan.test');

      const me = await request(app).get('/api/auth/me').set(authHeader(token));

      expect(me.body.data.user.profilePictureUrl).toBe(url);
      expect(me.body.data.user.profilePicturePath).toBeUndefined();
    });

    it("hides one customer's picture from another customer with a plain 404", async () => {
      const a = await uploadedCustomer('pp-a@panelscan.test');
      const b = await createCustomer({ email: 'pp-b@panelscan.test' });

      const stranger = await request(app).get(`/api${a.url}`).set(authHeader(b.token));
      const nonexistent = await request(app).get('/api/users/00000000-0000-4000-8000-000000000000/profile-picture').set(authHeader(b.token));

      expect(stranger.status).toBe(404);
      // Indistinguishable from "no such picture", so it never confirms one exists.
      expect(stranger.body).toEqual({ ...nonexistent.body });
      expect(JSON.stringify(stranger.body)).not.toContain('profiles/');
    });

    it('lets staff (OWNER and MODERATOR) view a customer picture', async () => {
      const customer = await uploadedCustomer('pp-staff@panelscan.test');
      const owner = await createOwner({ email: 'pp-owner@panelscan.test' });
      const moderator = await createModerator({ email: 'pp-mod@panelscan.test' });

      expect((await view(owner.token, customer.url)).status).toBe(200);
      expect((await view(moderator.token, customer.url)).status).toBe(200);
    });

    it('requires authentication', async () => {
      const { url } = await uploadedCustomer('pp-anon@panelscan.test');

      const response = await request(app).get(`/api${url}`);

      expect(response.status).toBe(401);
    });

    it('404s for a customer without a picture and 400s for a malformed id', async () => {
      const { token, user } = await createCustomer({ email: 'pp-none@panelscan.test' });

      expect((await request(app).get(`/api/users/${user.id}/profile-picture`).set(authHeader(token))).status).toBe(404);
      expect((await request(app).get('/api/users/not-a-uuid/profile-picture').set(authHeader(token))).status).toBe(400);
    });
  });

  // ------------------------------------------------------- access control

  describe('access control', () => {
    it('refuses upload and removal without a login', async () => {
      const image = await makeImage();

      const put = await request(app).put('/api/auth/me/profile-picture').attach('image', image, { filename: 'a.jpg', contentType: 'image/jpeg' });
      const del = await request(app).delete('/api/auth/me/profile-picture');

      expect(put.status).toBe(401);
      expect(del.status).toBe(401);
    });

    it('refuses upload and removal for staff accounts (customer-only feature)', async () => {
      const image = await makeImage();

      for (const { token } of [await createOwner({ email: 'pp-x-owner@panelscan.test' }), await createModerator({ email: 'pp-x-mod@panelscan.test' })]) {
        expect((await upload(token, image)).status).toBe(403);
        expect((await request(app).delete('/api/auth/me/profile-picture').set(authHeader(token))).status).toBe(403);
      }
    });

    it('refuses a deactivated customer', async () => {
      const { token } = await createCustomer({ email: 'pp-inactive@panelscan.test', isActive: false });

      expect((await upload(token, await makeImage())).status).toBe(403);
    });
  });

  // ------------------------------------- the public /uploads mount stays closed

  describe('the public /uploads mount', () => {
    it('never serves profile pictures directly, however the path is written', async () => {
      const created = await createCustomer({ email: 'pp-static@panelscan.test' });
      await upload(created.token, await makeImage());
      const relative = (await dbState(created.user.id)).profilePicturePath!;
      // Prove the file really is sitting under the static root, so a 404 below is the guard's doing.
      expect(fs.existsSync(path.join(uploadDir, ...relative.split('/')))).toBe(true);

      const attempts = [
        `/uploads/${relative}`,
        `/uploads/${relative.toUpperCase().replace('.WEBP', '.webp')}`,
        `/uploads/${relative.replace('profiles', '%70rofiles')}`,
        `/uploads/${relative.replace('profiles/', 'profiles%2F')}`,
        `/uploads/${relative.replace('profiles/', 'PROFILES/')}`,
        `/uploads/${relative.replace('profiles/', 'profiles%5C')}`,
        `/uploads//${relative}`,
        `/uploads/./${relative}`,
        `/uploads/profiles`,
        `/uploads/profiles/`,
        `/uploads/profiles/${created.user.id}`,
      ];

      for (const url of attempts) {
        const response = await request(app).get(url);
        expect(response.status, url).toBe(404);
        expect(response.headers['content-type'], url).not.toBe('image/webp');
      }
    });

    it('still serves ordinary uploaded files such as product images', async () => {
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, '1700000000000-product.png'), await makeImage('png', 20, 20));

      const response = await request(app).get('/uploads/1700000000000-product.png');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
    });
  });
});
