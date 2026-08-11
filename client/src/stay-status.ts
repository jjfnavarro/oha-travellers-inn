export type OccupancyStatus = 'VACANT' | 'OCCUPIED' | 'DUE_SOON' | 'OVERDUE';

export const checkoutSoonThresholdMilliseconds = 10 * 60 * 1000;

interface TimedStay {
  expectedCheckoutAt: string;
}

export function getOccupancyStatus(
  stay: TimedStay | undefined,
  now: number,
): OccupancyStatus {
  if (!stay) return 'VACANT';
  const remaining = new Date(stay.expectedCheckoutAt).getTime() - now;
  if (remaining <= 0) return 'OVERDUE';
  if (remaining <= checkoutSoonThresholdMilliseconds) return 'DUE_SOON';
  return 'OCCUPIED';
}
