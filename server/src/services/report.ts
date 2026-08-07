import { StayStatus, type PrismaClient } from '@prisma/client';
import { getOperationalDay } from './shift-time.js';

export type StatisticsPeriod = 'day' | 'week' | 'month';

export async function buildStatistics(
  prisma: PrismaClient,
  date: string,
  period: StatisticsPeriod,
) {
  const selected = getOperationalDay(date);
  let startsAt = selected.startsAt;
  let endsAt = selected.endsAt;
  if (period === 'week') {
    const dayOfWeek = startsAt.getUTCDay() || 7;
    startsAt = new Date(
      startsAt.getTime() - (dayOfWeek - 1) * 24 * 60 * 60 * 1000,
    );
    endsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'month') {
    startsAt = new Date(
      Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), 1),
    );
    endsAt = new Date(
      Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth() + 1, 1),
    );
  }

  const stays = await prisma.stay.findMany({
    where: { checkedInAt: { gte: startsAt, lt: endsAt } },
    select: { paidAmountCentavos: true, arrivalType: true, status: true },
  });
  return {
    period,
    startsAt,
    endsAt,
    totalStays: stays.length,
    totalAmountCentavos: stays.reduce(
      (sum, stay) => sum + stay.paidAmountCentavos,
      0,
    ),
    activeStays: stays.filter((stay) => stay.status === StayStatus.ACTIVE)
      .length,
    vehicleStays: stays.filter((stay) => stay.arrivalType === 'VEHICLE').length,
    walkInStays: stays.filter((stay) => stay.arrivalType === 'WALK_IN').length,
  };
}

export async function buildDailyReport(prisma: PrismaClient, date: string) {
  const window = getOperationalDay(date);
  const stays = await prisma.stay.findMany({
    where: { checkedInAt: { gte: window.startsAt, lt: window.endsAt } },
    include: { room: { include: { roomType: true } }, shift: true },
    orderBy: { checkedInAt: 'asc' },
  });

  const completed = stays.filter(
    (stay) => stay.status === StayStatus.COMPLETED,
  );
  const byRoomType = Object.values(
    stays.reduce<
      Record<
        string,
        { roomType: string; stays: number; amountCentavos: number }
      >
    >((totals, stay) => {
      const name = stay.room.roomType.name;
      totals[name] ??= { roomType: name, stays: 0, amountCentavos: 0 };
      totals[name].stays += 1;
      totals[name].amountCentavos += stay.paidAmountCentavos;
      return totals;
    }, {}),
  );

  return {
    date,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    summary: {
      totalStays: stays.length,
      totalAmountCentavos: stays.reduce(
        (sum, stay) => sum + stay.paidAmountCentavos,
        0,
      ),
      activeStays: stays.filter((stay) => stay.status === StayStatus.ACTIVE)
        .length,
      vehicleStays: stays.filter((stay) => stay.arrivalType === 'VEHICLE')
        .length,
      walkInStays: stays.filter((stay) => stay.arrivalType === 'WALK_IN')
        .length,
      earlyCheckouts: completed.filter(
        (stay) =>
          stay.checkedOutAt && stay.checkedOutAt < stay.expectedCheckoutAt,
      ).length,
      overdueCheckouts: completed.filter(
        (stay) =>
          stay.checkedOutAt && stay.checkedOutAt > stay.expectedCheckoutAt,
      ).length,
    },
    byRoomType,
    stays,
  };
}

export type DailyReport = Awaited<ReturnType<typeof buildDailyReport>>;
