import { ShiftType } from '@prisma/client';
import { describe, expect, test } from 'vitest';
import {
  currentOperationalDate,
  getOperationalDay,
  getShiftWindow,
} from './shift-time.js';

describe('Manila shift calculations', () => {
  test('assigns exact 8 AM and 8 PM boundaries to their new shifts', () => {
    const day = getShiftWindow(new Date('2026-08-07T00:00:00.000Z'));
    const night = getShiftWindow(new Date('2026-08-07T12:00:00.000Z'));

    expect(day.type).toBe(ShiftType.DAY);
    expect(day.startsAt.toISOString()).toBe('2026-08-07T00:00:00.000Z');
    expect(night.type).toBe(ShiftType.NIGHT);
    expect(night.startsAt.toISOString()).toBe('2026-08-07T12:00:00.000Z');
  });

  test('keeps after-midnight activity in the previous operational day', () => {
    expect(currentOperationalDate(new Date('2026-08-07T23:00:00.000Z'))).toBe(
      '2026-08-07',
    );
    const operationalDay = getOperationalDay('2026-08-07');
    expect(operationalDay.startsAt.toISOString()).toBe(
      '2026-08-07T00:00:00.000Z',
    );
    expect(operationalDay.endsAt.toISOString()).toBe(
      '2026-08-08T00:00:00.000Z',
    );
  });
});
