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

test('returns linked store sale details in stay history', async () => {
  const findMany = vi.fn().mockResolvedValue([
    {
      id: 10,
      storeSales: [
        {
          id: 20,
          paymentMethod: 'GCASH',
          totalAmountCentavos: 5_000,
          createdAt: new Date('2026-08-12T02:00:00.000Z'),
          handledBy: { id: 2, username: 'Dodong' },
          items: [
            {
              id: 30,
              productNameSnapshot: 'Extra Pillow',
              categorySnapshot: 'EXTRA_CHARGE',
              unitPriceCentavos: 5_000,
              quantity: 1,
              lineTotalCentavos: 5_000,
            },
          ],
        },
      ],
    },
  ]);
  const prisma = {
    session: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        expiresAt: new Date(Date.now() + 60_000),
        staff: {
          id: 2,
          username: 'Dodong',
          role: StaffRole.FRONT_DESK,
          isActive: true,
        },
      }),
    },
    stay: { findMany },
  } as unknown as PrismaClient;

  const response = await request(createApp(environment, vi.fn(), prisma))
    .get('/api/stays/history')
    .set('Cookie', 'oha_session=test');

  expect(response.status).toBe(200);
  expect(response.body.data[0].storeSales[0]).toMatchObject({
    paymentMethod: 'GCASH',
    totalAmountCentavos: 5_000,
    handledBy: { username: 'Dodong' },
    items: [
      {
        productNameSnapshot: 'Extra Pillow',
        quantity: 1,
        lineTotalCentavos: 5_000,
      },
    ],
  });
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      include: expect.objectContaining({
        storeSales: expect.objectContaining({
          select: expect.objectContaining({
            paymentMethod: true,
            totalAmountCentavos: true,
            handledBy: expect.any(Object),
            items: expect.any(Object),
          }),
        }),
      }),
    }),
  );
});

test.each([
  ['pdf', 'application/pdf', 'oha-stay-history.pdf'],
  [
    'xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'oha-stay-history.xlsx',
  ],
])(
  'exports filtered stay history as %s for front-desk users',
  async (extension, contentType, filename) => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 10,
        status: 'COMPLETED',
        arrivalType: 'VEHICLE',
        vehicleType: 'CAR',
        guestName: 'Guest',
        plateNumber: 'ABC 123',
        notes: 'Near lobby',
        durationHours: 3,
        paidAmountCentavos: 25_000,
        checkedInAt: new Date('2026-08-12T00:00:00.000Z'),
        expectedCheckoutAt: new Date('2026-08-12T03:00:00.000Z'),
        checkedOutAt: new Date('2026-08-12T02:30:00.000Z'),
        room: { number: '1', roomType: { name: 'Standard' } },
        shift: { type: 'DAY' },
        checkedInBy: { username: 'Dodong' },
        checkedOutBy: { username: 'Dodong' },
        extensions: [],
        storeSales: [],
      },
    ]);
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          expiresAt: new Date(Date.now() + 60_000),
          staff: {
            id: 2,
            username: 'Dodong',
            role: StaffRole.FRONT_DESK,
            isActive: true,
          },
        }),
      },
      stay: { findMany },
    } as unknown as PrismaClient;

    const response = await request(createApp(environment, vi.fn(), prisma))
      .get(
        `/api/stays/history.${extension}?status=COMPLETED&arrivalType=VEHICLE&roomId=1&roomTypeId=1&from=2026-08-12T00:00:00.000Z&to=2026-08-13T00:00:00.000Z`,
      )
      .set('Cookie', 'oha_session=test');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain(contentType);
    expect(response.headers['content-disposition']).toContain(filename);
    expect(Number(response.headers['content-length'])).toBeGreaterThan(100);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'COMPLETED',
          arrivalType: 'VEHICLE',
          roomId: 1,
          room: { roomTypeId: 1 },
          checkedInAt: {
            gte: new Date('2026-08-12T00:00:00.000Z'),
            lte: new Date('2026-08-13T00:00:00.000Z'),
          },
        }),
        take: 500,
      }),
    );
  },
);
