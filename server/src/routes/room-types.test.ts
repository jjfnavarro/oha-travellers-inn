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

describe('rate auditing', () => {
  test('saves previous and new rates in the update transaction', async () => {
    const previous = {
      id: 1,
      name: 'Standard',
      description: 'Standard guest room',
      rates: [{ durationHours: 3, amountCentavos: 25_000 }],
    };
    const updated = {
      ...previous,
      rates: [{ durationHours: 3, amountCentavos: 30_000 }],
    };
    const transaction = {
      roomType: {
        findUnique: vi.fn().mockResolvedValue(previous),
        update: vi.fn().mockResolvedValue(updated),
      },
      stayRate: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      roomRateOverride: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    };
    const prisma = {
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
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;

    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .patch('/api/room-types/1')
      .set('Cookie', 'oha_session=test')
      .send({
        name: 'Standard',
        description: 'Standard guest room',
        rates: [{ durationHours: 3, amountCentavos: 30_000 }],
      });

    expect(response.status).toBe(200);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'RATE_UPDATE',
        details: {
          previousValue: expect.objectContaining({ rates: previous.rates }),
          newValue: expect.objectContaining({ rates: updated.rates }),
        },
      }),
    });
  });
});
