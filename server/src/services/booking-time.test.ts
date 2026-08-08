import { describe, expect, test } from 'vitest';
import { bookingEndTime, bookingWindowsOverlap } from './booking-time.js';

describe('booking time rules', () => {
  test('calculates the expected end from arrival and duration', () => {
    expect(
      bookingEndTime({
        estimatedArrivalAt: new Date('2026-08-08T06:00:00.000Z'),
        expectedDurationHours: 6,
      }).toISOString(),
    ).toBe('2026-08-08T12:00:00.000Z');
  });

  test('detects overlapping room windows', () => {
    expect(
      bookingWindowsOverlap(
        {
          estimatedArrivalAt: new Date('2026-08-08T06:00:00.000Z'),
          expectedDurationHours: 6,
        },
        {
          estimatedArrivalAt: new Date('2026-08-08T09:00:00.000Z'),
          expectedDurationHours: 6,
        },
      ),
    ).toBe(true);
  });

  test('allows adjacent bookings where one ends as the next starts', () => {
    expect(
      bookingWindowsOverlap(
        {
          estimatedArrivalAt: new Date('2026-08-08T06:00:00.000Z'),
          expectedDurationHours: 3,
        },
        {
          estimatedArrivalAt: new Date('2026-08-08T09:00:00.000Z'),
          expectedDurationHours: 6,
        },
      ),
    ).toBe(false);
  });
});
