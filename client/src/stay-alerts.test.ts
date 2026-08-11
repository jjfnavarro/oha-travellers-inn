import { expect, test } from 'vitest';
import {
  buzzerDurationSeconds,
  claimStayAlert,
  checkoutAlertRepeatMilliseconds,
} from './stay-alerts';

test('repeats checkout-soon and overdue alerts every minute', () => {
  const alerts = new Map<number, number>();
  const now = Date.parse('2026-08-11T10:00:00.000Z');

  expect(claimStayAlert(7, 'DUE_SOON', now, alerts)).toBe(true);
  expect(claimStayAlert(7, 'DUE_SOON', now + 1_000, alerts)).toBe(false);
  expect(
    claimStayAlert(
      7,
      'DUE_SOON',
      now + checkoutAlertRepeatMilliseconds - 1,
      alerts,
    ),
  ).toBe(false);
  expect(
    claimStayAlert(7, 'OVERDUE', now + checkoutAlertRepeatMilliseconds, alerts),
  ).toBe(true);
  expect(claimStayAlert(7, 'OCCUPIED', now, alerts)).toBe(false);
  expect(buzzerDurationSeconds).toBe(10);
});
