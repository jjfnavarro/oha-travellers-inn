import { type PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { getShiftWindow } from '../services/shift-time.js';

const shiftInclude = {
  _count: { select: { stays: true } },
  stays: { select: { paidAmountCentavos: true } },
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
    response.json({
      data: {
        ...shift,
        totalAmountCentavos: shift.stays.reduce(
          (sum, stay) => sum + stay.paidAmountCentavos,
          0,
        ),
      },
    });
  });

  router.get('/history', async (_request, response) => {
    const shifts = await prisma.shift.findMany({
      include: shiftInclude,
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
    response.json({
      data: shifts.map((shift) => ({
        ...shift,
        totalAmountCentavos: shift.stays.reduce(
          (sum, stay) => sum + stay.paidAmountCentavos,
          0,
        ),
      })),
    });
  });

  return router;
}
