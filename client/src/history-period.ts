export type HistoryPeriod = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL' | 'CUSTOM';

interface HistoryWindow {
  from?: string;
  to?: string;
}

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function operationalStart(date: string): Date {
  return new Date(`${date}T08:00:00+08:00`);
}

function inclusiveEnd(start: Date, days: number): string {
  return new Date(start.getTime() + days * DAY_MILLISECONDS - 1).toISOString();
}

export function resolveHistoryWindow(
  period: HistoryPeriod,
  referenceDate: string,
  customFrom = '',
  customTo = '',
): HistoryWindow {
  if (period === 'ALL') return {};

  if (period === 'CUSTOM') {
    return {
      ...(customFrom
        ? { from: operationalStart(customFrom).toISOString() }
        : {}),
      ...(customTo ? { to: inclusiveEnd(operationalStart(customTo), 1) } : {}),
    };
  }

  const reference = operationalStart(referenceDate);
  if (period === 'TODAY') {
    return {
      from: reference.toISOString(),
      to: inclusiveEnd(reference, 1),
    };
  }

  if (period === 'WEEK') {
    const startsAt = new Date(
      reference.getTime() - reference.getUTCDay() * DAY_MILLISECONDS,
    );
    return {
      from: startsAt.toISOString(),
      to: inclusiveEnd(startsAt, 7),
    };
  }

  const startsAt = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1),
  );
  const nextMonth = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1),
  );
  return {
    from: startsAt.toISOString(),
    to: new Date(nextMonth.getTime() - 1).toISOString(),
  };
}
