import type { OccupancyStatus } from './stay-status';

export const checkoutAlertRepeatMilliseconds = 60_000;
export const buzzerDurationSeconds = 10;

export function claimStayAlert(
  stayId: number,
  status: OccupancyStatus,
  now: number,
  lastAlertByStay: Map<number, number>,
): boolean {
  if (status !== 'DUE_SOON' && status !== 'OVERDUE') return false;

  const lastAlert = lastAlertByStay.get(stayId);
  if (
    lastAlert !== undefined &&
    now - lastAlert < checkoutAlertRepeatMilliseconds
  )
    return false;
  lastAlertByStay.set(stayId, now);
  return true;
}
