import {
  ExpenseStatus,
  FinancialTransactionType,
  PaymentMethod,
  ShiftType,
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
const key = '550e8400-e29b-41d4-a716-446655440000';

function database(role: StaffRole = StaffRole.FRONT_DESK) {
  const staff = {
    id: role === StaffRole.OWNER ? 1 : 2,
    username: 'User',
    role,
  };
  const expense = {
    id: 7,
    amountCentavos: 50_000,
    reason: 'Cleaning supplies',
    status: ExpenseStatus.ACTIVE,
    idempotencyKey: key,
    recordedById: staff.id,
    shiftId: 4,
    businessDate: new Date('2026-08-18T00:00:00.000Z'),
    recordedBy: staff,
    voidedBy: null,
    shift: {
      id: 4,
      type: ShiftType.DAY,
      startsAt: new Date(),
      endsAt: new Date(),
    },
  };
  const transaction = {
    expense: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(expense),
      update: vi.fn().mockResolvedValue({
        ...expense,
        status: ExpenseStatus.VOIDED,
        voidedBy: staff,
      }),
    },
    shift: { upsert: vi.fn().mockResolvedValue({ id: 4 }) },
    financialTransaction: { create: vi.fn().mockResolvedValue({ id: 9 }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 10 }) },
  };
  const prisma = {
    session: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        expiresAt: new Date(Date.now() + 60_000),
        staff: { ...staff, isActive: true },
      }),
    },
    $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
      callback(transaction),
    ),
  } as unknown as PrismaClient;
  return { prisma, transaction, expense };
}

describe('expenses', () => {
  test.each([StaffRole.FRONT_DESK, StaffRole.OWNER])(
    '%s can create a Cash expense with attribution',
    async (role) => {
      const { prisma, transaction } = database(role);
      const response = await request(createApp(environment, vi.fn(), prisma))
        .post('/api/expenses')
        .set('Cookie', 'oha_session=test')
        .send({
          amountCentavos: 50_000,
          reason: 'Cleaning supplies',
          idempotencyKey: key,
        });

      expect(response.status).toBe(201);
      expect(transaction.financialTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          transactionType: FinancialTransactionType.EXPENSE,
          amountCentavos: 50_000,
          paymentMethod: PaymentMethod.CASH,
        }),
      });
      expect(transaction.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'EXPENSE_CREATE' }),
      });
    },
  );

  test.each([0, -1])('rejects invalid amount %s', async (amountCentavos) => {
    const { prisma, transaction } = database();
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/expenses')
      .set('Cookie', 'oha_session=test')
      .send({ amountCentavos, reason: 'Invalid', idempotencyKey: key });
    expect(response.status).toBe(400);
    expect(transaction.expense.create).not.toHaveBeenCalled();
  });

  test.each(['GCASH', 'CARD'])(
    'rejects attempts to force %s as the expense source',
    async (paymentMethod) => {
      const { prisma, transaction } = database();
      const response = await request(createApp(environment, vi.fn(), prisma))
        .post('/api/expenses')
        .set('Cookie', 'oha_session=test')
        .send({
          amountCentavos: 50_000,
          reason: 'Invalid source',
          idempotencyKey: key,
          paymentMethod,
        });
      expect(response.status).toBe(400);
      expect(transaction.expense.create).not.toHaveBeenCalled();
    },
  );

  test('Owner voids through a reversal instead of deleting history', async () => {
    const { prisma, transaction, expense } = database(StaffRole.OWNER);
    transaction.expense.findUnique.mockResolvedValue(expense);
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/expenses/7/void')
      .set('Cookie', 'oha_session=test')
      .send({ reason: 'Entered twice' });
    expect(response.status).toBe(200);
    expect(transaction.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        transactionType: FinancialTransactionType.EXPENSE_REVERSAL,
        paymentMethod: PaymentMethod.CASH,
      }),
    });
    expect(transaction.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ExpenseStatus.VOIDED }),
      }),
    );
  });

  test('Front Desk cannot void an expense', async () => {
    const { prisma, transaction } = database();
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/expenses/7/void')
      .set('Cookie', 'oha_session=test')
      .send({ reason: 'No permission' });
    expect(response.status).toBe(403);
    expect(transaction.expense.update).not.toHaveBeenCalled();
  });
});
