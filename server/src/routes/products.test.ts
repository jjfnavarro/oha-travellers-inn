import { ProductCategory, StaffRole, type PrismaClient } from '@prisma/client';
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

const session = (role: StaffRole) => ({
  id: 1,
  expiresAt: new Date(Date.now() + 60_000),
  staff: {
    id: 1,
    username: role === StaffRole.OWNER ? 'Zack' : 'Dodong',
    role,
    isActive: true,
  },
});

describe('product management', () => {
  test('creates a product and its audit record atomically', async () => {
    const product = {
      id: 4,
      name: 'Bottled Water',
      category: ProductCategory.STORE_PRODUCT,
      sellingPriceCentavos: 2_500,
      imageUrl: null,
      isActive: true,
    };
    const transaction = {
      product: { create: vi.fn().mockResolvedValue(product) },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.OWNER)),
      },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/products')
      .set('Cookie', 'oha_session=test')
      .send({
        name: product.name,
        category: product.category,
        sellingPriceCentavos: 2_500,
        imageUrl: null,
      });
    expect(response.status).toBe(201);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE_PRODUCT',
        entityId: '4',
      }),
    });
  });

  test('denies Front Desk product creation on the backend', async () => {
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.FRONT_DESK)),
      },
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/products')
      .set('Cookie', 'oha_session=test')
      .send({
        name: 'Soap',
        category: ProductCategory.STORE_PRODUCT,
        sellingPriceCentavos: 2_000,
      });
    expect(response.status).toBe(403);
  });

  test('records previous and new values when deactivating a product', async () => {
    const previous = {
      id: 4,
      name: 'Extra Pillow',
      category: ProductCategory.EXTRA_CHARGE,
      sellingPriceCentavos: 5_000,
      imageUrl: null,
      isActive: true,
    };
    const updated = { ...previous, isActive: false };
    const transaction = {
      product: {
        findUnique: vi.fn().mockResolvedValue(previous),
        update: vi.fn().mockResolvedValue(updated),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.OWNER)),
      },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .patch('/api/products/4')
      .set('Cookie', 'oha_session=test')
      .send({ isActive: false });
    expect(response.status).toBe(200);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DEACTIVATE_PRODUCT',
        details: {
          previousValue: expect.objectContaining({ isActive: true }),
          newValue: expect.objectContaining({ isActive: false }),
        },
      }),
    });
  });
});
