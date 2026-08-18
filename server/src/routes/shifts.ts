import {
  FinancialTransactionType,
  PaymentMethod,
  type PrismaClient,
} from '@prisma/client';
import { Router } from 'express';
import { getShiftWindow } from '../services/shift-time.js';

const shiftInclude = {
  _count: { select: { stays: true } },
};

const revenueTypes = new Set<FinancialTransactionType>([
  FinancialTransactionType.ROOM_CHARGE,
  FinancialTransactionType.EXTENSION_CHARGE,
  FinancialTransactionType.STORE_SALE,
  FinancialTransactionType.EXTRA_CHARGE,
]);

type ShiftTransaction = {
  amountCentavos: number;
  transactionType: FinancialTransactionType;
  paymentMethod: PaymentMethod;
};

function shiftFinancials(transactions: ShiftTransaction[]) {
  const grossRevenueCentavos = transactions
    .filter((item) => revenueTypes.has(item.transactionType))
    .reduce((sum, item) => sum + item.amountCentavos, 0);
  const cashRevenueCentavos = transactions
    .filter(
      (item) =>
        revenueTypes.has(item.transactionType) &&
        item.paymentMethod === PaymentMethod.CASH,
    )
    .reduce((sum, item) => sum + item.amountCentavos, 0);
  const cashExpensesCentavos = transactions.reduce((sum, item) => {
    if (item.transactionType === FinancialTransactionType.EXPENSE) {
      return sum + item.amountCentavos;
    }
    if (item.transactionType === FinancialTransactionType.EXPENSE_REVERSAL) {
      return sum - item.amountCentavos;
    }
    return sum;
  }, 0);
  return {
    totalAmountCentavos: grossRevenueCentavos,
    grossRevenueCentavos,
    cashExpensesCentavos,
    netRevenueCentavos: grossRevenueCentavos - cashExpensesCentavos,
    expectedRemainingCashCentavos: cashRevenueCentavos - cashExpensesCentavos,
  };
}

export function createShiftsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/current', async (_request, response) => {
    const window = getShiftWindow(new Date());
    const shift = await prisma.shift.upsert({
      where: { startsAt: window.startsAt },
      update: { type: window.type, endsAt: window.endsAt },
      create: window,
      include: shiftInclude,
    });
    const transactions = await prisma.financialTransaction.findMany({
      where: { createdAt: { gte: shift.startsAt, lt: shift.endsAt } },
      select: {
        amountCentavos: true,
        transactionType: true,
        paymentMethod: true,
      },
    });
    response.json({
      data: {
        ...shift,
        ...shiftFinancials(transactions),
      },
    });
  });

  router.get('/history', async (_request, response) => {
    const shifts = await prisma.shift.findMany({
      include: shiftInclude,
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
    const transactions =
      shifts.length === 0
        ? []
        : await prisma.financialTransaction.findMany({
            where: {
              createdAt: {
                gte: shifts[shifts.length - 1]!.startsAt,
                lt: shifts[0]!.endsAt,
              },
            },
            select: {
              amountCentavos: true,
              transactionType: true,
              paymentMethod: true,
              createdAt: true,
            },
          });
    const totals = new Map<number, ShiftTransaction[]>();
    for (const transaction of transactions) {
      const startsAt = getShiftWindow(transaction.createdAt).startsAt.getTime();
      const list = totals.get(startsAt) ?? [];
      list.push(transaction);
      totals.set(startsAt, list);
    }
    response.json({
      data: shifts.map((shift) => ({
        ...shift,
        ...shiftFinancials(totals.get(shift.startsAt.getTime()) ?? []),
      })),
    });
  });

  return router;
}
