import {
  FinancialTransactionType,
  PaymentMethod,
  ProductCategory,
  StaffRole,
  type PrismaClient,
} from '@prisma/client';
import { expect, test, vi } from 'vitest';
import { buildStoreReport } from './store-report.js';

test('calculates store, extra-charge, payment, product, and staff totals', async () => {
  const createdAt = new Date('2026-08-11T02:00:00.000Z');
  const sales = [
    {
      id: 1,
      handledByUserId: 2,
      stayId: null,
      paymentMethod: PaymentMethod.CASH,
      totalAmountCentavos: 5_000,
      createdAt,
      handledBy: { id: 2, username: 'Dodong' },
      stay: null,
      items: [
        {
          productId: 1,
          productNameSnapshot: 'Bottled Water',
          categorySnapshot: ProductCategory.STORE_PRODUCT,
          unitPriceCentavos: 2_500,
          quantity: 2,
          lineTotalCentavos: 5_000,
        },
      ],
    },
    {
      id: 2,
      handledByUserId: 2,
      stayId: 10,
      paymentMethod: PaymentMethod.GCASH,
      totalAmountCentavos: 5_000,
      createdAt,
      handledBy: { id: 2, username: 'Dodong' },
      stay: { id: 10, room: { number: '22' } },
      items: [
        {
          productId: 2,
          productNameSnapshot: 'Extra Pillow',
          categorySnapshot: ProductCategory.EXTRA_CHARGE,
          unitPriceCentavos: 5_000,
          quantity: 1,
          lineTotalCentavos: 5_000,
        },
      ],
    },
  ];
  const transactions = [
    {
      handledById: 2,
      handledBy: { id: 2, username: 'Dodong' },
      transactionType: FinancialTransactionType.STORE_SALE,
      amountCentavos: 5_000,
      paymentMethod: PaymentMethod.CASH,
      createdAt,
    },
    {
      handledById: 2,
      handledBy: { id: 2, username: 'Dodong' },
      transactionType: FinancialTransactionType.EXTRA_CHARGE,
      amountCentavos: 5_000,
      paymentMethod: PaymentMethod.GCASH,
      createdAt,
    },
  ];
  const prisma = {
    staffAccount: {
      findFirst: vi.fn().mockResolvedValue({
        id: 2,
        username: 'Dodong',
        role: StaffRole.FRONT_DESK,
      }),
    },
    storeSale: { findMany: vi.fn().mockResolvedValue(sales) },
    financialTransaction: { findMany: vi.fn().mockResolvedValue(transactions) },
  } as unknown as PrismaClient;
  const report = await buildStoreReport(prisma, {
    preset: 'specific_date',
    shift: 'ALL',
    date: '2026-08-11',
    staffId: 2,
    now: new Date('2026-08-11T04:00:00.000Z'),
  });
  expect(report.summary).toEqual({
    storeRevenueCentavos: 5_000,
    extraChargesRevenueCentavos: 5_000,
    totalRevenueCentavos: 10_000,
    salesCount: 2,
    itemsSold: 3,
  });
  expect(report.paymentMethods).toEqual([
    { method: PaymentMethod.CASH, count: 1, amountCentavos: 5_000 },
    { method: PaymentMethod.GCASH, count: 1, amountCentavos: 5_000 },
    { method: PaymentMethod.CARD, count: 0, amountCentavos: 0 },
  ]);
  expect(report.products[0]).toMatchObject({
    name: 'Bottled Water',
    quantity: 2,
    revenueCentavos: 5_000,
  });
  expect(report.staff[0]).toMatchObject({
    username: 'Dodong',
    totalRevenueCentavos: 10_000,
  });

  const gcashReport = await buildStoreReport(prisma, {
    preset: 'specific_date',
    shift: 'ALL',
    date: '2026-08-11',
    paymentMethod: PaymentMethod.GCASH,
    now: new Date('2026-08-11T04:00:00.000Z'),
  });
  expect(gcashReport.summary).toEqual({
    storeRevenueCentavos: 0,
    extraChargesRevenueCentavos: 5_000,
    totalRevenueCentavos: 5_000,
    salesCount: 1,
    itemsSold: 1,
  });
  expect(gcashReport.paymentMethods).toEqual([
    { method: PaymentMethod.GCASH, count: 1, amountCentavos: 5_000 },
  ]);
  expect(gcashReport.products).toHaveLength(1);
  expect(gcashReport.products[0]?.name).toBe('Extra Pillow');
  expect(gcashReport.activity).toHaveLength(1);

  const cardSale = {
    ...sales[0]!,
    id: 3,
    paymentMethod: PaymentMethod.CARD,
    totalAmountCentavos: 7_500,
    items: [
      {
        ...sales[0]!.items[0]!,
        quantity: 3,
        lineTotalCentavos: 7_500,
      },
    ],
  };
  const cardTransaction = {
    ...transactions[0]!,
    paymentMethod: PaymentMethod.CARD,
    amountCentavos: 7_500,
  };
  vi.mocked(prisma.storeSale.findMany).mockResolvedValue([
    ...sales,
    cardSale,
  ] as never);
  vi.mocked(prisma.financialTransaction.findMany).mockResolvedValue([
    ...transactions,
    cardTransaction,
  ] as never);
  const cardReport = await buildStoreReport(prisma, {
    preset: 'specific_date',
    shift: 'ALL',
    date: '2026-08-11',
    paymentMethod: PaymentMethod.CARD,
    now: new Date('2026-08-11T04:00:00.000Z'),
  });
  expect(cardReport.paymentMethods).toEqual([
    { method: PaymentMethod.CARD, count: 1, amountCentavos: 7_500 },
  ]);
  expect(cardReport.summary.totalRevenueCentavos).toBe(7_500);
});
