import { ShiftType } from '@prisma/client';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const SHIFT_DURATION_MS = 12 * 60 * 60 * 1000;
const OPERATIONAL_DAY_MS = 24 * 60 * 60 * 1000;

export interface ShiftWindow {
  type: ShiftType;
  startsAt: Date;
  endsAt: Date;
}

export function getShiftWindow(instant: Date): ShiftWindow {
  const manilaTime = new Date(instant.getTime() + MANILA_OFFSET_MS);
  const year = manilaTime.getUTCFullYear();
  const month = manilaTime.getUTCMonth();
  const day = manilaTime.getUTCDate();
  const hour = manilaTime.getUTCHours();

  if (hour >= 8 && hour < 20) {
    const startsAt = new Date(Date.UTC(year, month, day, 0));
    return {
      type: ShiftType.DAY,
      startsAt,
      endsAt: new Date(startsAt.getTime() + SHIFT_DURATION_MS),
    };
  }

  const startDay = hour >= 20 ? day : day - 1;
  const startsAt = new Date(Date.UTC(year, month, startDay, 12));
  return {
    type: ShiftType.NIGHT,
    startsAt,
    endsAt: new Date(startsAt.getTime() + SHIFT_DURATION_MS),
  };
}

export function getOperationalDay(dateText: string): {
  startsAt: Date;
  endsAt: Date;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) throw new Error('Date must use YYYY-MM-DD format.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const startsAt = new Date(Date.UTC(year, month - 1, day, 0));
  if (
    startsAt.getUTCFullYear() !== year ||
    startsAt.getUTCMonth() !== month - 1 ||
    startsAt.getUTCDate() !== day
  ) {
    throw new Error('Date is not valid.');
  }
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + OPERATIONAL_DAY_MS),
  };
}

export function currentOperationalDate(instant = new Date()): string {
  const manilaTime = new Date(instant.getTime() + MANILA_OFFSET_MS);
  if (manilaTime.getUTCHours() < 8)
    manilaTime.setUTCDate(manilaTime.getUTCDate() - 1);
  return `${manilaTime.getUTCFullYear()}-${String(manilaTime.getUTCMonth() + 1).padStart(2, '0')}-${String(manilaTime.getUTCDate()).padStart(2, '0')}`;
}
