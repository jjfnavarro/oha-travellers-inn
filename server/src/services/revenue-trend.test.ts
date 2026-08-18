import { FinancialTransactionType } from '@prisma/client';
import { expect, test } from 'vitest';
import { buildRevenueTrend } from './revenue-trend.js';

test('creates zero-filled hourly revenue buckets by transaction source', () => {
  const trend = buildRevenueTrend(
    [
      {
        createdAt: new Date('2026-08-11T00:30:00.000Z'),
        transactionType: FinancialTransactionType.ROOM_CHARGE,
        amountCentavos: 50_000,
      },
      {
        createdAt: new Date('2026-08-11T01:15:00.000Z'),
        transactionType: FinancialTransactionType.STORE_SALE,
        amountCentavos: 5_000,
      },
    ],
    new Date('2026-08-11T00:00:00.000Z'),
    new Date('2026-08-11T03:00:00.000Z'),
    'HOUR',
  );

  expect(trend).toHaveLength(3);
  expect(trend[0]).toMatchObject({
    label: '8 AM',
    roomRevenueCentavos: 50_000,
    totalRevenueCentavos: 50_000,
  });
  expect(trend[1]).toMatchObject({
    label: '9 AM',
    storeRevenueCentavos: 5_000,
    totalRevenueCentavos: 5_000,
  });
  expect(trend[2]?.totalRevenueCentavos).toBe(0);
});

test('creates monthly buckets for yearly reports', () => {
  const trend = buildRevenueTrend(
    [
      {
        createdAt: new Date('2026-08-11T01:00:00.000Z'),
        transactionType: FinancialTransactionType.ROOM_CHARGE,
        amountCentavos: 100_000,
      },
    ],
    new Date('2026-01-01T00:00:00.000Z'),
    new Date('2027-01-01T00:00:00.000Z'),
    'MONTH',
  );
  expect(trend).toHaveLength(12);
  expect(trend[7]).toMatchObject({
    label: 'Aug',
    totalRevenueCentavos: 100_000,
  });
});
