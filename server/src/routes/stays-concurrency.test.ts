import {
  ArrivalType,
  PaymentMethod,
  Prisma,
  RoomOperationalStatus,
  StaffRole,
  StayStatus,
  type PrismaClient,
} from '@prisma/client';
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

const authSession = {
  id: 1,
  expiresAt: new Date(Date.now() + 60_000),
  staff: {
    id: 2,
    username: 'Dodong',
    role: StaffRole.FRONT_DESK,
    isActive: true,
  },
};

function activeRoom(
  status: RoomOperationalStatus = RoomOperationalStatus.ACTIVE,
) {
  return {
    id: 1,
    number: '1',
    roomTypeId: 1,
    displayOrder: 1,
    operationalStatus: status,
    roomType: {
      id: 1,
      name: 'Standard',
      rates: [{ id: 1, durationHours: 3, amountCentavos: 25_000 }],
    },
    rateOverrides: [],
  };
}

describe('stay concurrency and cleaning rules', () => {
  test('allows exactly one of two simultaneous check-ins for one room', async () => {
    let occupied = false;
    let stayId = 0;
    const transaction = {
      room: { findUnique: vi.fn().mockResolvedValue(activeRoom()) },
      stay: {
        findUnique: vi.fn(async () => (occupied ? { id: stayId } : null)),
        create: vi.fn(async () => {
          await Promise.resolve();
          if (occupied) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique active room',
              { code: 'P2002', clientVersion: 'test' },
            );
          }
          occupied = true;
          stayId += 1;
          return { id: stayId, roomId: 1 };
        }),
      },
      shift: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      financialTransaction: { create: vi.fn().mockResolvedValue({ id: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    };
    const prisma = {
      session: { findUnique: vi.fn().mockResolvedValue(authSession) },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const app = createApp(
      environment,
      vi.fn().mockResolvedValue(undefined),
      prisma,
    );
    const body = {
      roomId: 1,
      durationHours: 3,
      arrivalType: ArrivalType.WALK_IN,
      paymentMethod: PaymentMethod.CASH,
    };

    const responses = await Promise.all([
      request(app)
        .post('/api/stays/check-in')
        .set('Cookie', 'oha_session=a')
        .send(body),
      request(app)
        .post('/api/stays/check-in')
        .set('Cookie', 'oha_session=b')
        .send(body),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(transaction.financialTransaction.create).toHaveBeenCalledOnce();
  });

  test('rejects check-in while a room is cleaning', async () => {
    const transaction = {
      room: {
        findUnique: vi
          .fn()
          .mockResolvedValue(activeRoom(RoomOperationalStatus.CLEANING)),
      },
    };
    const prisma = {
      session: { findUnique: vi.fn().mockResolvedValue(authSession) },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;

    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .post('/api/stays/check-in')
      .set('Cookie', 'oha_session=test')
      .send({
        roomId: 1,
        durationHours: 3,
        arrivalType: ArrivalType.WALK_IN,
        paymentMethod: PaymentMethod.CASH,
      });

    expect(response.status).toBe(409);
  });

  test('charges a room-specific rate override at check-in', async () => {
    const room = {
      ...activeRoom(),
      number: '7',
      rateOverrides: [
        { id: 1, roomId: 1, durationHours: 3, amountCentavos: 30_000 },
      ],
    };
    const transaction = {
      room: { findUnique: vi.fn().mockResolvedValue(room) },
      stay: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 1, roomId: 1 }),
      },
      shift: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      financialTransaction: { create: vi.fn().mockResolvedValue({ id: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    };
    const prisma = {
      session: { findUnique: vi.fn().mockResolvedValue(authSession) },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;

    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .post('/api/stays/check-in')
      .set('Cookie', 'oha_session=test')
      .send({
        roomId: 1,
        durationHours: 3,
        arrivalType: ArrivalType.WALK_IN,
        paymentMethod: PaymentMethod.CASH,
      });

    expect(response.status).toBe(201);
    expect(transaction.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountCentavos: 30_000 }),
    });
  });

  test('moves a checked-out room to cleaning in the same transaction', async () => {
    const transaction = {
      stay: {
        findFirst: vi.fn().mockResolvedValue({
          id: 9,
          roomId: 1,
          status: StayStatus.ACTIVE,
          expectedCheckoutAt: new Date(Date.now() + 60_000),
        }),
        update: vi
          .fn()
          .mockResolvedValue({ id: 9, status: StayStatus.COMPLETED }),
      },
      room: { update: vi.fn().mockResolvedValue({ id: 1 }) },
      booking: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    };
    const prisma = {
      session: { findUnique: vi.fn().mockResolvedValue(authSession) },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;

    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .post('/api/stays/9/check-out')
      .set('Cookie', 'oha_session=test');

    expect(response.status).toBe(200);
    expect(transaction.room.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { operationalStatus: RoomOperationalStatus.CLEANING },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(2);
  });
});
