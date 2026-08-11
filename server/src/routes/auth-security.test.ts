import { StaffRole, type PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';
import { createApp } from '../app.js';
import type { Environment } from '../config/env.js';

const environment: Environment = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: 'mysql://user:password@localhost:3306/test',
  SHADOW_DATABASE_URL: 'mysql://user:password@localhost:3306/test_shadow',
  CLIENT_URL: 'http://localhost:5173',
  BUSINESS_TIMEZONE: 'Asia/Manila',
};

describe('authentication hardening', () => {
  test('returns a client error for malformed JSON', async () => {
    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined)),
    )
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{invalid');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Request body must contain valid JSON.',
    });
  });

  test('temporarily limits repeated failed login attempts', async () => {
    const prisma = {
      staffAccount: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const app = createApp(
      environment,
      vi.fn().mockResolvedValue(undefined),
      prisma,
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post('/api/auth/login').send({
        username: 'Dodong',
        password: 'incorrect',
      });
      expect(response.status).toBe(401);
    }
    const limited = await request(app).post('/api/auth/login').send({
      username: 'Dodong',
      password: 'incorrect',
    });

    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.body).toEqual({
      message: 'Too many failed login attempts. Try again later.',
    });
  });

  test('deactivated sessions remain unauthorized', async () => {
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          expiresAt: new Date(Date.now() + 60_000),
          staff: {
            id: 2,
            username: 'Dodong',
            role: StaffRole.FRONT_DESK,
            isActive: false,
          },
        }),
        delete: vi.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaClient;

    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .get('/api/rooms')
      .set('Cookie', 'oha_session=test-token');

    expect(response.status).toBe(401);
  });
});
