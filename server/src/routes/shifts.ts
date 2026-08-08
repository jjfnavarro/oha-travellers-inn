import { type PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { getShiftWindow } from '../services/shift-time.js';

const shiftInclude = {
  _count: { select: { stays: true } },
};

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
    const transactions = await prisma.financialTransaction.aggregate({
      where: { createdAt: { gte: shift.startsAt, lt: shift.endsAt } },
      _sum: { amountCentavos: true },
    });
    response.json({
      data: {
        ...shift,
        totalAmountCentavos: transactions._sum.amountCentavos ?? 0,
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
            select: { amountCentavos: true, createdAt: true },
          });
    const totals = new Map<number, number>();
    for (const transaction of transactions) {
      const startsAt = getShiftWindow(transaction.createdAt).startsAt.getTime();
      totals.set(
        startsAt,
        (totals.get(startsAt) ?? 0) + transaction.amountCentavos,
      );
    }
    response.json({
      data: shifts.map((shift) => ({
        ...shift,
        totalAmountCentavos: totals.get(shift.startsAt.getTime()) ?? 0,
      })),
    });
  });

  return router;
}
