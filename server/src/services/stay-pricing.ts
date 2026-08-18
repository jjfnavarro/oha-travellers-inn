export const maximumStayDays = 365;

const restrictedDurations: Record<string, readonly number[]> = {
  FAMILY: [12, 24],
  TRANSIENT: [12, 24],
};

export const canonicalRoomTypeNames = [
  'STANDARD',
  'DELUXE',
  'SUITE',
  'FAMILY',
  'TRANSIENT',
] as const;

export function normalizedRoomTypeName(name: string): string {
  return name.trim().toUpperCase();
}

export function allowedHourlyDurations(
  roomTypeName: string,
): readonly number[] | undefined {
  return restrictedDurations[normalizedRoomTypeName(roomTypeName)];
}

export function durationAllowedForRoomType(
  roomTypeName: string,
  durationHours: number,
): boolean {
  const restricted = allowedHourlyDurations(roomTypeName);
  return restricted ? restricted.includes(durationHours) : true;
}

export function configuredDurationsAreValid(
  roomTypeName: string,
  durations: number[],
): boolean {
  const restricted = allowedHourlyDurations(roomTypeName);
  if (!restricted) return true;
  const values = new Set(durations);
  return (
    values.size === restricted.length &&
    restricted.every((duration) => values.has(duration))
  );
}

type Rate = {
  durationHours: number;
  amountCentavos: number;
};

type PricedRoom = {
  roomType: { name: string; rates: Rate[] };
  rateOverrides: Rate[];
};

export type StayDurationInput =
  | { durationHours: number; numberOfDays?: null | undefined }
  | { numberOfDays: number; durationHours?: undefined };

export type StayPricing = {
  durationHours: number;
  numberOfDays: number | null;
  rateAmountCentavos: number;
  totalAmountCentavos: number;
};

export class StayPricingError extends Error {}

export function effectiveRoomRate(
  room: PricedRoom,
  durationHours: number,
): Rate | undefined {
  return (
    room.rateOverrides.find((rate) => rate.durationHours === durationHours) ??
    room.roomType.rates.find((rate) => rate.durationHours === durationHours)
  );
}

export function resolveStayPricing(
  room: PricedRoom,
  input: StayDurationInput,
): StayPricing {
  if (input.numberOfDays !== undefined && input.numberOfDays !== null) {
    if (
      !Number.isSafeInteger(input.numberOfDays) ||
      input.numberOfDays < 1 ||
      input.numberOfDays > maximumStayDays
    ) {
      throw new StayPricingError(
        `Number of days must be a whole number from 1 to ${maximumStayDays}.`,
      );
    }
    const rate = effectiveRoomRate(room, 24);
    if (!rate) {
      throw new StayPricingError(
        'This room does not have a 24-hour rate for multi-day stays.',
      );
    }
    const totalAmountCentavos = rate.amountCentavos * input.numberOfDays;
    if (
      !Number.isSafeInteger(totalAmountCentavos) ||
      totalAmountCentavos > 2_147_483_647
    ) {
      throw new StayPricingError('The calculated stay amount is too large.');
    }
    return {
      durationHours: input.numberOfDays * 24,
      numberOfDays: input.numberOfDays,
      rateAmountCentavos: rate.amountCentavos,
      totalAmountCentavos,
    };
  }

  const durationHours = input.durationHours;
  if (
    !Number.isSafeInteger(durationHours) ||
    durationHours < 1 ||
    !durationAllowedForRoomType(room.roomType.name, durationHours)
  ) {
    throw new StayPricingError(
      'The selected duration is not offered for this room type.',
    );
  }
  const rate = effectiveRoomRate(room, durationHours);
  if (!rate) {
    throw new StayPricingError(
      'The selected duration is not offered for this room.',
    );
  }
  return {
    durationHours,
    numberOfDays: null,
    rateAmountCentavos: rate.amountCentavos,
    totalAmountCentavos: rate.amountCentavos,
  };
}
