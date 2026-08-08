export interface BookingWindow {
  estimatedArrivalAt: Date;
  expectedDurationHours: number;
}

export function bookingEndTime(window: BookingWindow): Date {
  return new Date(
    window.estimatedArrivalAt.getTime() +
      window.expectedDurationHours * 60 * 60 * 1000,
  );
}

export function bookingWindowsOverlap(
  left: BookingWindow,
  right: BookingWindow,
): boolean {
  return (
    left.estimatedArrivalAt < bookingEndTime(right) &&
    right.estimatedArrivalAt < bookingEndTime(left)
  );
}
