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

describe('Owner report authorization', () => {
  test('denies Front Desk accounts on the backend', async () => {
    const database = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          expiresAt: new Date(Date.now() + 60_000),
          staff: {
            id: 2,
            username: 'Along',
            role: StaffRole.FRONT_DESK,
            isActive: true,
          },
        }),
      },
    } as unknown as PrismaClient;

    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), database),
    )
      .get('/api/reports/owner')
      .set('Cookie', 'oha_session=test-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'Owner access is required.' });
  });
});
