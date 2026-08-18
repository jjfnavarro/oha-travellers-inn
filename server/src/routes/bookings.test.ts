import {
  ArrivalType,
  BookingStatus,
  PaymentMethod,
  RoomOperationalStatus,
  StaffRole,
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

function session(role: StaffRole = StaffRole.FRONT_DESK) {
  return {
    id: 1,
    expiresAt: new Date(Date.now() + 60_000),
    staff: { id: 2, username: 'Dodong', role, isActive: true },
  };
}

function conversionDatabase(failFinancialWrite = false) {
  const booking = {
    id: 7,
    bookingDate: new Date('2026-08-08T00:00:00.000Z'),
    estimatedArrivalAt: new Date('2026-08-08T06:00:00.000Z'),
    roomId: 22,
    expectedDurationHours: 3,
    guestName: 'Guest',
    contactNumber: null,
    arrivalType: ArrivalType.WALK_IN,
    plateNumber: null,
    bookingReference: 'OHA-7',
    notes: null,
    status: BookingStatus.CONFIRMED,
  };
  const transaction = {
    booking: {
      findUnique: vi.fn().mockResolvedValue(booking),
      update: vi
        .fn()
        .mockResolvedValue({ ...booking, status: BookingStatus.ARRIVED }),
    },
    room: {
      findUnique: vi.fn().mockResolvedValue({
        id: 22,
        operationalStatus: RoomOperationalStatus.ACTIVE,
        roomType: {
          name: 'Standard',
          rates: [{ durationHours: 3, amountCentavos: 45_000 }],
        },
        rateOverrides: [],
      }),
    },
    stay: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 91, roomId: 22 }),
    },
    shift: { upsert: vi.fn().mockResolvedValue({ id: 4 }) },
    financialTransaction: {
      create: failFinancialWrite
        ? vi.fn().mockRejectedValue(new Error('write failed'))
        : vi.fn().mockResolvedValue({ id: 10 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 11 }) },
  };
  const prisma = {
    session: { findUnique: vi.fn().mockResolvedValue(session()) },
    $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
      callback(transaction),
    ),
  };
  return { prisma: prisma as unknown as PrismaClient, transaction };
}

describe('booking routes', () => {
  test('requires an authenticated account', async () => {
    const prisma = {
      session: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    ).get('/api/bookings?date=2026-08-08');

    expect(response.status).toBe(401);
  });

  test('allows a Front Desk account to view bookings', async () => {
    const prisma = {
      session: { findUnique: vi.fn().mockResolvedValue(session()) },
      booking: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .get('/api/bookings?date=2026-08-08')
      .set('Cookie', 'oha_session=test-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });

  test('rejects an overlapping booking for the same room', async () => {
    const bookingCreate = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 22 }]),
      room: {
        findUnique: vi.fn().mockResolvedValue({
          id: 22,
          operationalStatus: RoomOperationalStatus.ACTIVE,
          roomType: {
            rates: [{ durationHours: 6, amountCentavos: 90_000 }],
          },
        }),
      },
      booking: {
        findMany: vi.fn().mockResolvedValue([
          {
            estimatedArrivalAt: new Date('2026-08-08T06:00:00.000Z'),
            expectedDurationHours: 6,
          },
        ]),
        create: bookingCreate,
      },
    };
    const prisma = {
      session: { findUnique: vi.fn().mockResolvedValue(session()) },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;

    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .post('/api/bookings')
      .set('Cookie', 'oha_session=test-token')
      .send({
        bookingDate: '2026-08-08',
        estimatedArrivalAt: '2026-08-08T09:00:00.000Z',
        roomId: 22,
        expectedDurationHours: 6,
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      message: 'This room already has an overlapping booking.',
    });
    expect(bookingCreate).not.toHaveBeenCalled();
  });

  test('converts a booking into one stay and one room-charge transaction', async () => {
    const { prisma, transaction } = conversionDatabase();
    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .post('/api/bookings/7/arrive')
      .set('Cookie', 'oha_session=test-token')
      .send({ paymentMethod: PaymentMethod.GCASH });

    expect(response.status).toBe(201);
    expect(transaction.stay.create).toHaveBeenCalledOnce();
    expect(transaction.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountCentavos: 45_000,
        paymentMethod: PaymentMethod.GCASH,
      }),
    });
    expect(transaction.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BookingStatus.ARRIVED,
          convertedStayId: 91,
        }),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledOnce();
  });

  test('accepts Card when converting a booking to a paid stay', async () => {
    const { prisma, transaction } = conversionDatabase();
    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .post('/api/bookings/7/arrive')
      .set('Cookie', 'oha_session=test-token')
      .send({ paymentMethod: PaymentMethod.CARD });

    expect(response.status).toBe(201);
    expect(transaction.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ paymentMethod: PaymentMethod.CARD }),
    });
  });

  test('converts a three-day booking using the effective 24-hour rate', async () => {
    const { prisma, transaction } = conversionDatabase();
    transaction.booking.findUnique.mockResolvedValue({
      id: 7,
      roomId: 22,
      expectedDurationHours: 72,
      numberOfDays: 3,
      guestName: 'Guest',
      arrivalType: ArrivalType.WALK_IN,
      vehicleType: null,
      plateNumber: null,
      notes: null,
      bookingReference: 'OHA-7',
      status: BookingStatus.CONFIRMED,
    });
    transaction.room.findUnique.mockResolvedValue({
      id: 22,
      operationalStatus: RoomOperationalStatus.ACTIVE,
      roomType: {
        name: 'Standard',
        rates: [{ durationHours: 24, amountCentavos: 100_000 }],
      },
      rateOverrides: [{ durationHours: 24, amountCentavos: 120_000 }],
    });
    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .post('/api/bookings/7/arrive')
      .set('Cookie', 'oha_session=test-token')
      .send({ paymentMethod: PaymentMethod.CASH });

    expect(response.status).toBe(201);
    expect(transaction.stay.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          durationHours: 72,
          numberOfDays: 3,
          rateAmountCentavos: 120_000,
          paidAmountCentavos: 360_000,
        }),
      }),
    );
  });

  test('does not update the booking after a failed financial write', async () => {
    const { prisma, transaction } = conversionDatabase(true);
    const response = await request(
      createApp(environment, vi.fn().mockResolvedValue(undefined), prisma),
    )
      .post('/api/bookings/7/arrive')
      .set('Cookie', 'oha_session=test-token')
      .send({ paymentMethod: PaymentMethod.CASH });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: 'The request could not be completed. Please try again.',
    });
    expect(transaction.booking.update).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
