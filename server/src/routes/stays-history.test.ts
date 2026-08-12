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
