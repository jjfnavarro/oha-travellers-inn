import {
  FinancialTransactionType,
  PaymentMethod,
  ProductCategory,
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
const key = '550e8400-e29b-41d4-a716-446655440000';

function database(
  category: ProductCategory = ProductCategory.STORE_PRODUCT,
  failFinancial = false,
) {
  const product = {
    id: 7,
    name:
      category === ProductCategory.STORE_PRODUCT
        ? 'Bottled Water'
        : 'Extra Pillow',
    category,
    sellingPriceCentavos: 2_500,
    isActive: true,
  };
  const sale = {
    id: 9,
    handledByUserId: 2,
    stayId: null,
    paymentMethod: PaymentMethod.CASH,
    totalAmountCentavos: 5_000,
    idempotencyKey: key,
  };
  const complete = {
    ...sale,
    items: [{ productId: 7, quantity: 2 }],
    handledBy: { id: 2, username: 'Dodong' },
    stay: null,
    financialTransactions: [],
  };
  const transaction = {
    storeSale: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(sale),
      findUniqueOrThrow: vi.fn().mockResolvedValue(complete),
    },
    product: { findUnique: vi.fn().mockResolvedValue(product) },
    stay: { findFirst: vi.fn().mockResolvedValue({ id: 10 }) },
    financialTransaction: {
      create: failFinancial
        ? vi.fn().mockRejectedValue(new Error('write failed'))
        : vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    session: { findUnique: vi.fn().mockResolvedValue(authSession) },
    storeSale: { findUnique: vi.fn() },
    $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
      callback(transaction),
    ),
  } as unknown as PrismaClient;
  return { prisma, transaction };
}

describe('store purchases', () => {
  test.each([
    [
      ProductCategory.STORE_PRODUCT,
      PaymentMethod.CASH,
      FinancialTransactionType.STORE_SALE,
      null,
    ],
    [
      ProductCategory.EXTRA_CHARGE,
      PaymentMethod.GCASH,
      FinancialTransactionType.EXTRA_CHARGE,
      10,
    ],
  ])(
    'calculates quantity and creates a %s ledger transaction',
    async (category, paymentMethod, transactionType, stayId) => {
      const { prisma, transaction } = database(category);
      const response = await request(createApp(environment, vi.fn(), prisma))
        .post('/api/store-sales')
        .set('Cookie', 'oha_session=test')
        .send({
          productId: 7,
          quantity: 2,
          paymentMethod,
          stayId,
          idempotencyKey: key,
        });
      expect(response.status).toBe(201);
      expect(transaction.storeSale.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          handledByUserId: 2,
          stayId,
          paymentMethod,
          totalAmountCentavos: 5_000,
          items: {
            create: expect.objectContaining({
              productNameSnapshot: expect.any(String),
              categorySnapshot: category,
              unitPriceCentavos: 2_500,
              quantity: 2,
              lineTotalCentavos: 5_000,
            }),
          },
        }),
      });
      expect(transaction.financialTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeSaleId: 9,
          handledById: 2,
          transactionType,
          amountCentavos: 5_000,
          paymentMethod,
        }),
      });
      expect(transaction.auditLog.create).toHaveBeenCalledOnce();
    },
  );

  test('rejects an extra charge without a stay', async () => {
    const { prisma, transaction } = database(ProductCategory.EXTRA_CHARGE);
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/store-sales')
      .set('Cookie', 'oha_session=test')
      .send({
        productId: 7,
        quantity: 1,
        paymentMethod: 'CASH',
        stayId: null,
        idempotencyKey: key,
      });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Select an occupied room for this extra charge.',
    );
    expect(transaction.stay.findFirst).not.toHaveBeenCalled();
    expect(transaction.storeSale.create).not.toHaveBeenCalled();
  });

  test('rejects an extra charge when the selected stay is no longer active', async () => {
    const { prisma, transaction } = database(ProductCategory.EXTRA_CHARGE);
    transaction.stay.findFirst.mockResolvedValue(null);
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/store-sales')
      .set('Cookie', 'oha_session=test')
      .send({
        productId: 7,
        quantity: 1,
        paymentMethod: 'GCASH',
        stayId: 10,
        idempotencyKey: key,
      });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      'The selected room no longer has an active stay.',
    );
    expect(transaction.stay.findFirst).toHaveBeenCalledWith({
      where: {
        id: 10,
        status: 'ACTIVE',
        activeRoomId: { not: null },
      },
      select: { id: true },
    });
    expect(transaction.storeSale.create).not.toHaveBeenCalled();
  });

  test('rejects an inactive product before creating a sale', async () => {
    const { prisma, transaction } = database();
    transaction.product.findUnique.mockResolvedValue({
      id: 7,
      isActive: false,
    });
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/store-sales')
      .set('Cookie', 'oha_session=test')
      .send({
        productId: 7,
        quantity: 1,
        paymentMethod: 'CASH',
        idempotencyKey: key,
      });
    expect(response.status).toBe(409);
    expect(transaction.storeSale.create).not.toHaveBeenCalled();
  });

  test('returns an existing matching purchase without another financial write', async () => {
    const { prisma, transaction } = database();
    transaction.storeSale.findUnique.mockResolvedValue({
      id: 9,
      handledByUserId: 2,
      stayId: null,
      paymentMethod: PaymentMethod.CASH,
      totalAmountCentavos: 5_000,
      idempotencyKey: key,
      items: [{ productId: 7, quantity: 2 }],
      handledBy: { id: 2, username: 'Dodong' },
      stay: null,
      financialTransactions: [],
    });
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/store-sales')
      .set('Cookie', 'oha_session=test')
      .send({
        productId: 7,
        quantity: 2,
        paymentMethod: 'CASH',
        idempotencyKey: key,
      });
    expect(response.status).toBe(200);
    expect(response.body.repeated).toBe(true);
    expect(transaction.financialTransaction.create).not.toHaveBeenCalled();
  });

  test('does not write an audit record when the financial write fails', async () => {
    const { prisma, transaction } = database(
      ProductCategory.STORE_PRODUCT,
      true,
    );
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/store-sales')
      .set('Cookie', 'oha_session=test')
      .send({
        productId: 7,
        quantity: 2,
        paymentMethod: 'CASH',
        idempotencyKey: key,
      });
    expect(response.status).toBe(500);
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
