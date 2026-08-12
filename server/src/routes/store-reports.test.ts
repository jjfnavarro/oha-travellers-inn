import { StaffRole, type PrismaClient } from '@prisma/client';
import request from 'supertest';
import { expect, test, vi } from 'vitest';
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

function database(): PrismaClient {
  return {
    session: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        expiresAt: new Date(Date.now() + 60_000),
        staff: {
          id: 1,
          username: 'Zack',
          role: StaffRole.OWNER,
          isActive: true,
        },
      }),
    },
    storeSale: { findMany: vi.fn().mockResolvedValue([]) },
    financialTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
}

test.each([
  ['pdf', 'application/pdf', 'oha-store-report.pdf'],
  [
    'xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'oha-store-report.xlsx',
  ],
])(
  'exports the current Store %s report name',
  async (extension, type, name) => {
    const response = await request(createApp(environment, vi.fn(), database()))
      .get(`/api/reports/store/${extension}`)
      .set('Cookie', 'oha_session=test');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain(type);
    expect(response.headers['content-disposition']).toContain(name);
  },
);
