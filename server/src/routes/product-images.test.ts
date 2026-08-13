import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StaffRole, type PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../app.js';
import type { Environment } from '../config/env.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function setup(role: StaffRole) {
  const directory = await mkdtemp(join(tmpdir(), 'oha-product-images-'));
  directories.push(directory);
  const environment: Environment = {
    NODE_ENV: 'test',
    PORT: 4000,
    DATABASE_URL: 'mysql://user:password@localhost:3306/test',
    SHADOW_DATABASE_URL: 'mysql://user:password@localhost:3306/test_shadow',
    CLIENT_URL: 'http://localhost:5173',
    BUSINESS_TIMEZONE: 'Asia/Manila',
    PRODUCT_IMAGE_DIR: directory,
  };
  const prisma = {
    session: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        expiresAt: new Date(Date.now() + 60_000),
        staff: { id: 1, username: 'Zack', role, isActive: true },
      }),
    },
  } as unknown as PrismaClient;
  return { app: createApp(environment, vi.fn(), prisma), directory };
}

describe('product image uploads', () => {
  test('allows browser-generated image previews in production', async () => {
    const { app } = await setup(StaffRole.OWNER);
    const response = await request(app).get('/api/health');

    expect(response.headers['content-security-policy']).toContain(
      "img-src 'self' data: blob: https:",
    );
  });

  test('stores and serves a validated Owner upload', async () => {
    const { app, directory } = await setup(StaffRole.OWNER);
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    const upload = await request(app)
      .post('/api/product-images/upload')
      .set('Cookie', 'oha_session=test')
      .set('Content-Type', 'image/png')
      .send(png);

    expect(upload.status).toBe(201);
    const imageUrl = upload.body.data.imageUrl as string;
    expect(imageUrl).toMatch(/^\/api\/product-images\/[a-f0-9-]+\.png$/);
    expect(
      await readFile(join(directory, imageUrl.split('/').at(-1)!)),
    ).toEqual(png);
    expect((await request(app).get(imageUrl)).status).toBe(200);
  });

  test('rejects invalid content and denies Front Desk uploads', async () => {
    const owner = await setup(StaffRole.OWNER);
    const invalid = await request(owner.app)
      .post('/api/product-images/upload')
      .set('Cookie', 'oha_session=test')
      .set('Content-Type', 'image/png')
      .send(Buffer.from('not an image'));
    expect(invalid.status).toBe(400);

    const frontDesk = await setup(StaffRole.FRONT_DESK);
    const denied = await request(frontDesk.app)
      .post('/api/product-images/upload')
      .set('Cookie', 'oha_session=test')
      .set('Content-Type', 'image/png')
      .send(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(denied.status).toBe(403);
  });
});
