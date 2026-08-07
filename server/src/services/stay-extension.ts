const hourInMilliseconds = 60 * 60 * 1000;

export function calculateExtendedCheckout(
  expectedCheckoutAt: Date,
  durationHours: number,
): Date {
  return new Date(
    expectedCheckoutAt.getTime() + durationHours * hourInMilliseconds,
  );
}
