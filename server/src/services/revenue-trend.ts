import { FinancialTransactionType } from '@prisma/client';

export type RevenueTrendGranularity = 'HOUR' | 'DAY';

export interface RevenueTrendTransaction {
  createdAt: Date;
  transactionType: FinancialTransactionType;
  amountCentavos: number;
}

export interface RevenueTrendPoint {
  key: string;
  label: string;
  roomRevenueCentavos: number;
  extensionRevenueCentavos: number;
  storeRevenueCentavos: number;
  extraChargesRevenueCentavos: number;
  totalRevenueCentavos: number;
}

const hourLabel = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: 'numeric',
});
const dayLabel = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
});

export function buildRevenueTrend(
  transactions: RevenueTrendTransaction[],
  startsAt: Date,
  endsAt: Date,
  granularity: RevenueTrendGranularity,
): RevenueTrendPoint[] {
  const stepMilliseconds =
    granularity === 'HOUR' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const points: RevenueTrendPoint[] = [];

  for (
    let timestamp = startsAt.getTime();
    timestamp < endsAt.getTime();
    timestamp += stepMilliseconds
  ) {
    const date = new Date(timestamp);
    points.push({
      key: date.toISOString(),
      label:
        granularity === 'HOUR' ? hourLabel.format(date) : dayLabel.format(date),
      roomRevenueCentavos: 0,
      extensionRevenueCentavos: 0,
      storeRevenueCentavos: 0,
      extraChargesRevenueCentavos: 0,
      totalRevenueCentavos: 0,
    });
  }

  for (const transaction of transactions) {
    const index = Math.floor(
      (transaction.createdAt.getTime() - startsAt.getTime()) / stepMilliseconds,
    );
    const point = points[index];
    if (!point) continue;
    point.totalRevenueCentavos += transaction.amountCentavos;
    if (transaction.transactionType === FinancialTransactionType.ROOM_CHARGE) {
      point.roomRevenueCentavos += transaction.amountCentavos;
    } else if (
      transaction.transactionType === FinancialTransactionType.EXTENSION_CHARGE
    ) {
      point.extensionRevenueCentavos += transaction.amountCentavos;
    } else if (
      transaction.transactionType === FinancialTransactionType.STORE_SALE
    ) {
      point.storeRevenueCentavos += transaction.amountCentavos;
    } else if (
      transaction.transactionType === FinancialTransactionType.EXTRA_CHARGE
    ) {
      point.extraChargesRevenueCentavos += transaction.amountCentavos;
    }
  }

  return points;
}
