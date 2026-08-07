import { describe, expect, test } from 'vitest';
import { calculateExtendedCheckout } from './stay-extension.js';

describe('calculateExtendedCheckout', () => {
  test('adds the package duration to the scheduled checkout time', () => {
    const checkout = new Date('2026-08-07T12:00:00.000Z');

    expect(calculateExtendedCheckout(checkout, 3).toISOString()).toBe(
      '2026-08-07T15:00:00.000Z',
    );
  });

  test('uses the scheduled checkout even when the stay is already overdue', () => {
    const overdueCheckout = new Date('2026-08-07T08:00:00.000Z');

    expect(calculateExtendedCheckout(overdueCheckout, 6).toISOString()).toBe(
      '2026-08-07T14:00:00.000Z',
    );
  });
});
