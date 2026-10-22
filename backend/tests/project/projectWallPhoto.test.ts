import fs from 'fs';
import path from 'path';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { authHeader, createCustomer, createModerator, createOwner } from '../helpers/factories';
import app from '../helpers/testApp';

// tests/setupEnv.ts points UPLOAD_DIR at a throwaway temp folder for the run.
const uploadDir = process.env.UPLOAD_DIR as string;
// libvips keeps file handles open by default, which blocks cleanup on Windows.
sharp.cache(false);

afterEach(() => {
  fs.rmSync(uploadDir, { recursive: true, force: true });
});
afterAll(() => {
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

const STORED_PATH = /^wall-photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

const appProject = {
  externalProjectId: 'app-wall-1',
  name: 'Sala wall',
  budget: 4200,
  arMetadata: { surfaceType: 'WALL', widthMeters: 3.2, heightMeters: 2.6, finalQuantity: 7 },
};

const photo = (width = 2400, height = 1800) =>
  sharp({ create: { width, height, channels: 3, background: { r: 180, g: 150, b: 120 } } }).jpeg().toBuffer();

const saveProject = async (token: string) => {
  const response = await request(app).post('/api/projects/mobile').set(authHeader(token)).send(appProject);
  expect(response.status).toBe(200);
  return response.body.data.project as { id: string };
};

const uploadPhoto = (token: string, externalProjectId: string, buffer: Buffer, name = 'wall.jpg') =>
  request(app).put(`/api/projects/mobile/${externalProjectId}/wall-photo`).set(authHeader(token)).attach('image', buffer, name);

const binary = (req: request.Test) =>
  req.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });

describe('Wall photo of a mobile project', () => {
  it('the customer saves it; staff see it, re-encoded and at most 1600 px, while the stored location stays hidden', async () => {
    const customer = await createCustomer();
    const owner = await createOwner();
    const moderator = await createModerator();
    const project = await saveProject(customer.token);

    const uploaded = await uploadPhoto(customer.token, appProject.externalProjectId, await photo());
    expect(uploaded.status).toBe(200);
    const wallPhotoUrl = uploaded.body.data.project.wallPhotoUrl as string;
    expect(wallPhotoUrl).toMatch(new RegExp(`^/projects/${project.id}/wall-photo\\?v=[0-9a-f-]{36}$`));
    expect(uploaded.body.data.project).not.toHaveProperty('arDataUrl');

    const stored = (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).arDataUrl!;
    expect(stored).toMatch(STORED_PATH);
    expect(fs.existsSync(path.join(uploadDir, ...stored.split('/')))).toBe(true);

    for (const staff of [owner, moderator]) {
      const listed = await request(app).get('/api/projects').set(authHeader(staff.token));
      const row = listed.body.data.projects.find((item: { id: string }) => item.id === project.id);
      expect(row.wallPhotoUrl).toBe(wallPhotoUrl);
      expect(row).not.toHaveProperty('arDataUrl');

      const image = await binary(request(app).get(`/api${wallPhotoUrl}`).set(authHeader(staff.token)));
      expect(image.status).toBe(200);
      expect(image.headers['content-type']).toBe('image/jpeg');
      expect(image.headers['cache-control']).toContain('immutable');
      const meta = await sharp(image.body as Buffer).metadata();
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1600);
      expect(meta.exif).toBeUndefined();
    }
  });

  it('a customer sees only their own, and can only add one to their own project', async () => {
    const customer = await createCustomer();
    const other = await createCustomer();
    const project = await saveProject(customer.token);
    await uploadPhoto(customer.token, appProject.externalProjectId, await photo(800, 600));

    const listed = await request(app).get('/api/projects').set(authHeader(customer.token));
    const wallPhotoUrl = listed.body.data.projects.find((item: { id: string }) => item.id === project.id).wallPhotoUrl as string;
    const own = await binary(request(app).get(`/api${wallPhotoUrl}`).set(authHeader(customer.token)));
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('image/jpeg');
    // Another customer's request looks the same as a project that doesn't exist.
    expect((await request(app).get(`/api/projects/${project.id}/wall-photo`).set(authHeader(other.token))).status).toBe(404);
    expect((await request(app).get(`/api/projects/${project.id}/wall-photo`)).status).toBe(401);
    // The public uploads mount refuses the folder outright.
    const stored = (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).arDataUrl!;
    expect((await request(app).get(`/uploads/${stored}`)).status).toBe(404);
    // Another customer has no project with that app id: 404, nothing written.
    expect((await uploadPhoto(other.token, appProject.externalProjectId, await photo(800, 600))).status).toBe(404);
  });

  it('refuses a file that is not an image, and no photo means a null URL and a 404', async () => {
    const customer = await createCustomer();
    const owner = await createOwner();
    const project = await saveProject(customer.token);

    expect((await uploadPhoto(customer.token, appProject.externalProjectId, Buffer.from('not an image'), 'wall.jpg')).status).toBe(400);
    const listed = await request(app).get(`/api/projects/${project.id}`).set(authHeader(owner.token));
    expect(listed.body.data.project.wallPhotoUrl).toBeNull();
    expect((await request(app).get(`/api/projects/${project.id}/wall-photo`).set(authHeader(owner.token))).status).toBe(404);
  });

  it('a new photo replaces the old file, and deleting the project removes it', async () => {
    const customer = await createCustomer();
    const project = await saveProject(customer.token);
    await uploadPhoto(customer.token, appProject.externalProjectId, await photo(800, 600));
    const first = (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).arDataUrl!;
    await uploadPhoto(customer.token, appProject.externalProjectId, await photo(900, 600));
    const second = (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).arDataUrl!;

    expect(second).not.toBe(first);
    expect(fs.existsSync(path.join(uploadDir, ...first.split('/')))).toBe(false);
    expect(fs.existsSync(path.join(uploadDir, ...second.split('/')))).toBe(true);

    const deleted = await request(app).delete(`/api/projects/mobile/${appProject.externalProjectId}`).set(authHeader(customer.token));
    expect(deleted.status).toBe(200);
    expect(fs.existsSync(path.join(uploadDir, 'wall-photos', project.id))).toBe(false);
  });
});
