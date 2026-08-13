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

test('Owner can save an audited room-specific rate override', async () => {
  const room = {
    id: 7,
    number: '7',
    roomType: {
      id: 1,
      rates: [{ durationHours: 3, amountCentavos: 25_000 }],
    },
    rateOverrides: [],
    stays: [],
  };
  const updated = {
    ...room,
    rateOverrides: [
      { id: 1, roomId: 7, durationHours: 3, amountCentavos: 30_000 },
    ],
  };
  const transaction = {
    room: {
      findUnique: vi.fn().mockResolvedValue(room),
      findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
    },
    roomRateOverride: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
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
    .patch('/api/rooms/7/rates')
    .set('Cookie', 'oha_session=test')
    .send({
      overrides: [{ durationHours: 3, amountCentavos: 30_000 }],
    });

  expect(response.status).toBe(200);
  expect(transaction.roomRateOverride.createMany).toHaveBeenCalledWith({
    data: [{ roomId: 7, durationHours: 3, amountCentavos: 30_000 }],
  });
  expect(transaction.auditLog.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      action: 'ROOM_RATE_UPDATE',
      entityType: 'ROOM',
      entityId: '7',
    }),
  });
});
