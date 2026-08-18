import { describe, expect, test } from 'vitest';
import {
  configuredDurationsAreValid,
  resolveStayPricing,
  StayPricingError,
} from './stay-pricing.js';

const transientRoom = {
  roomType: {
    name: 'Transient',
    rates: [
      { durationHours: 12, amountCentavos: 180_000 },
      { durationHours: 24, amountCentavos: 250_000 },
    ],
  },
  rateOverrides: [] as { durationHours: number; amountCentavos: number }[],
};

describe('stay pricing', () => {
  test.each([12, 24])('Transient supports %s-hour stays', (durationHours) => {
    expect(resolveStayPricing(transientRoom, { durationHours })).toEqual(
      expect.objectContaining({ durationHours, numberOfDays: null }),
    );
  });

  test.each([3, 6])('Transient rejects %s-hour stays', (durationHours) => {
    expect(() => resolveStayPricing(transientRoom, { durationHours })).toThrow(
      StayPricingError,
    );
  });

  test('uses the room-specific 24-hour override for Days', () => {
    const pricing = resolveStayPricing(
      {
        ...transientRoom,
        rateOverrides: [{ durationHours: 24, amountCentavos: 300_000 }],
      },
      { numberOfDays: 3 },
    );
    expect(pricing).toEqual({
      durationHours: 72,
      numberOfDays: 3,
      rateAmountCentavos: 300_000,
      totalAmountCentavos: 900_000,
    });
  });

  test.each([0, -1, 1.5, 366])(
    'rejects invalid day count %s',
    (numberOfDays) => {
      expect(() => resolveStayPricing(transientRoom, { numberOfDays })).toThrow(
        StayPricingError,
      );
    },
  );

  test('requires Family and Transient to keep 12h and 24h defaults', () => {
    expect(configuredDurationsAreValid('Family', [12, 24])).toBe(true);
    expect(configuredDurationsAreValid('Transient', [3, 12, 24])).toBe(false);
  });
});
