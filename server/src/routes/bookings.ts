import {
  ArrivalType,
  BookingStatus,
  FinancialTransactionType,
  PaymentMethod,
  Prisma,
  RoomOperationalStatus,
  StayStatus,
  VehicleType,
  type PrismaClient,
} from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { bookingWindowsOverlap } from '../services/booking-time.js';
import { getShiftWindow } from '../services/shift-time.js';
import {
  maximumStayDays,
  resolveStayPricing,
  StayPricingError,
} from '../services/stay-pricing.js';

const bookingFields = z
  .object({
    bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    estimatedArrivalAt: z.coerce.date().optional().nullable(),
    roomId: z.number().int().positive().optional().nullable(),
    expectedDurationHours: z
      .number()
      .int()
      .positive()
      .max(maximumStayDays * 24),
    numberOfDays: z.number().int().positive().max(maximumStayDays).optional(),
    guestName: z.string().trim().max(100).optional().nullable(),
    contactNumber: z.string().trim().max(30).optional().nullable(),
    arrivalType: z.nativeEnum(ArrivalType).optional().nullable(),
    vehicleType: z.nativeEnum(VehicleType).optional().nullable(),
    plateNumber: z.string().trim().max(30).optional().nullable(),
    bookingReference: z.string().trim().max(50).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.numberOfDays !== undefined &&
      value.expectedDurationHours !== value.numberOfDays * 24
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The booking duration must match the selected number of days.',
      });
    }
    if (value.numberOfDays === undefined && value.expectedDurationHours > 24) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hourly booking packages cannot exceed 24 hours.',
      });
    }
  });

const statusSchema = z.object({
  status: z.enum([
    BookingStatus.CONFIRMED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ]),
});

const conversionSchema = z.object({
  roomId: z.number().int().positive().optional(),
  paymentMethod: z.enum([
    PaymentMethod.CASH,
    PaymentMethod.GCASH,
    PaymentMethod.CARD,
  ]),
  arrivalType: z.nativeEnum(ArrivalType).optional(),
  vehicleType: z.nativeEnum(VehicleType).optional().nullable(),
});

const blockingStatuses = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.ARRIVED,
];

const bookingInclude = {
  room: { include: { roomType: { include: { rates: true } } } },
  createdBy: { select: { id: true, username: true } },
  updatedBy: { select: { id: true, username: true } },
  convertedStay: { select: { id: true, status: true } },
};

type BookingInput = z.infer<typeof bookingFields>;

class BookingRuleError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function bookingDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BookingRuleError('Select a valid booking date.', 400);
  }
  return date;
}

function bookingData(input: BookingInput) {
  return {
    bookingDate: bookingDate(input.bookingDate),
    estimatedArrivalAt: input.estimatedArrivalAt ?? null,
    roomId: input.roomId ?? null,
    expectedDurationHours: input.expectedDurationHours,
    numberOfDays: input.numberOfDays ?? null,
    guestName: optionalText(input.guestName),
    contactNumber: optionalText(input.contactNumber),
    arrivalType: input.arrivalType ?? null,
    vehicleType:
      input.arrivalType === ArrivalType.VEHICLE
        ? (input.vehicleType ?? null)
        : null,
    plateNumber:
      input.arrivalType === ArrivalType.WALK_IN
        ? null
        : (optionalText(input.plateNumber)?.toUpperCase() ?? null),
    bookingReference: optionalText(input.bookingReference),
    notes: optionalText(input.notes),
  };
}

async function validateRoomAndConflict(
  transaction: Prisma.TransactionClient,
  input: BookingInput,
  excludedBookingId?: number,
): Promise<void> {
  if (!input.roomId) {
    const offeredRate = await transaction.stayRate.findFirst({
      where: {
        durationHours:
          input.numberOfDays === undefined ? input.expectedDurationHours : 24,
      },
      select: { id: true },
    });
    if (!offeredRate) {
      throw new BookingRuleError(
        'The selected duration is not offered by the motel.',
        400,
      );
    }
    return;
  }
  const room = await transaction.room.findUnique({
    where: { id: input.roomId },
    include: { roomType: { include: { rates: true } } },
  });
  if (!room) throw new BookingRuleError('Room not found.', 404);
  await transaction.$queryRaw(
    Prisma.sql`SELECT id FROM Room WHERE id = ${input.roomId} FOR UPDATE`,
  );
  if (room.operationalStatus !== RoomOperationalStatus.ACTIVE) {
    throw new BookingRuleError('This room is not available for booking.', 409);
  }
  if (
    !room.roomType.rates.some(
      (rate) =>
        rate.durationHours ===
        (input.numberOfDays === undefined ? input.expectedDurationHours : 24),
    )
  ) {
    throw new BookingRuleError(
      'The selected duration is not offered for this room.',
      400,
    );
  }
  if (!input.estimatedArrivalAt) return;

  const candidates = await transaction.booking.findMany({
    where: {
      roomId: input.roomId,
      status: { in: blockingStatuses },
      estimatedArrivalAt: { not: null },
      ...(excludedBookingId ? { id: { not: excludedBookingId } } : {}),
    },
    select: { estimatedArrivalAt: true, expectedDurationHours: true },
  });
  const conflict = candidates.some(
    (candidate) =>
      candidate.estimatedArrivalAt &&
      bookingWindowsOverlap(
        {
          estimatedArrivalAt: input.estimatedArrivalAt!,
          expectedDurationHours: input.expectedDurationHours,
        },
        {
          estimatedArrivalAt: candidate.estimatedArrivalAt,
          expectedDurationHours: candidate.expectedDurationHours,
        },
      ),
  );
  if (conflict) {
    throw new BookingRuleError(
      'This room already has an overlapping booking.',
      409,
    );
  }
}

export function createBookingsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    const query = z
      .object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        status: z.nativeEnum(BookingStatus).optional(),
      })
      .safeParse(request.query);
    if (!query.success) {
      response
        .status(400)
        .json({ message: 'The booking filters are invalid.' });
      return;
    }
    const exactDate = query.data.date
      ? bookingDate(query.data.date)
      : undefined;
    const bookings = await prisma.booking.findMany({
      where: {
        ...(exactDate
          ? { bookingDate: exactDate }
          : query.data.from || query.data.to
            ? {
                bookingDate: {
                  ...(query.data.from
                    ? { gte: bookingDate(query.data.from) }
                    : {}),
                  ...(query.data.to ? { lte: bookingDate(query.data.to) } : {}),
                },
              }
            : {}),
        ...(query.data.status ? { status: query.data.status } : {}),
      },
      include: bookingInclude,
      orderBy: [
        { bookingDate: 'asc' },
        { estimatedArrivalAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: 500,
    });
    response.json({ data: bookings });
  });

  router.post('/', async (request, response) => {
    const body = bookingFields.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ message: 'Enter valid booking details.' });
      return;
    }
    try {
      const booking = await prisma.$transaction(
        async (transaction) => {
          await validateRoomAndConflict(transaction, body.data);
          const created = await transaction.booking.create({
            data: {
              ...bookingData(body.data),
              createdByUserId: request.authUser.id,
            },
            include: bookingInclude,
          });
          await transaction.auditLog.create({
            data: {
              staffId: request.authUser.id,
              action: 'CREATE_BOOKING',
              entityType: 'BOOKING',
              entityId: String(created.id),
              details: {
                roomId: created.roomId,
                bookingDate: body.data.bookingDate,
                estimatedArrivalAt: created.estimatedArrivalAt,
                expectedDurationHours: created.expectedDurationHours,
                numberOfDays: created.numberOfDays,
              },
            },
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      response.status(201).json({ data: booking });
    } catch (error: unknown) {
      if (error instanceof BookingRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response
          .status(409)
          .json({ message: 'That booking reference is already in use.' });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        response.status(409).json({
          message:
            'Room availability changed. Review the booking and try again.',
        });
        return;
      }
      throw error;
    }
  });

  router.patch('/:id', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = bookingFields.safeParse(request.body);
    if (!id.success || !body.success) {
      response.status(400).json({ message: 'Enter valid booking details.' });
      return;
    }
    try {
      const booking = await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.booking.findUnique({
            where: { id: id.data },
          });
          if (!existing) throw new BookingRuleError('Booking not found.', 404);
          if (!(
            existing.status === BookingStatus.PENDING ||
            existing.status === BookingStatus.CONFIRMED
          )) {
            throw new BookingRuleError(
              'Only pending or confirmed bookings can be edited.',
              409,
            );
          }
          await validateRoomAndConflict(transaction, body.data, existing.id);
          const updated = await transaction.booking.update({
            where: { id: existing.id },
            data: {
              ...bookingData(body.data),
              updatedByUserId: request.authUser.id,
            },
            include: bookingInclude,
          });
          await transaction.auditLog.create({
            data: {
              staffId: request.authUser.id,
              action: 'UPDATE_BOOKING',
              entityType: 'BOOKING',
              entityId: String(existing.id),
              details: {
                previousStatus: existing.status,
                roomId: updated.roomId,
              },
            },
          });
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      response.json({ data: booking });
    } catch (error: unknown) {
      if (error instanceof BookingRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response
          .status(409)
          .json({ message: 'That booking reference is already in use.' });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        response.status(409).json({
          message:
            'Room availability changed. Review the booking and try again.',
        });
        return;
      }
      throw error;
    }
  });

  router.post('/:id/status', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = statusSchema.safeParse(request.body);
    if (!id.success || !body.success) {
      response.status(400).json({ message: 'Select a valid booking status.' });
      return;
    }
    try {
      const booking = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.booking.findUnique({
          where: { id: id.data },
        });
        if (!existing) throw new BookingRuleError('Booking not found.', 404);
        const allowed =
          (body.data.status === BookingStatus.CONFIRMED &&
            existing.status === BookingStatus.PENDING) ||
          ((body.data.status === BookingStatus.CANCELLED ||
            body.data.status === BookingStatus.NO_SHOW) &&
            (existing.status === BookingStatus.PENDING ||
              existing.status === BookingStatus.CONFIRMED));
        if (!allowed) {
          throw new BookingRuleError(
            'That booking status change is not allowed.',
            409,
          );
        }
        const action =
          body.data.status === BookingStatus.CONFIRMED
            ? 'CONFIRM_BOOKING'
            : body.data.status === BookingStatus.CANCELLED
              ? 'CANCEL_BOOKING'
              : 'MARK_BOOKING_NO_SHOW';
        const updated = await transaction.booking.update({
          where: { id: existing.id },
          data: {
            status: body.data.status,
            updatedByUserId: request.authUser.id,
          },
          include: bookingInclude,
        });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action,
            entityType: 'BOOKING',
            entityId: String(existing.id),
            details: {
              previousValue: existing.status,
              newValue: body.data.status,
            },
          },
        });
        return updated;
      });
      response.json({ data: booking });
    } catch (error: unknown) {
      if (error instanceof BookingRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  router.post('/:id/arrive', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = conversionSchema.safeParse(request.body);
    if (!id.success || !body.success) {
      response
        .status(400)
        .json({ message: 'Select a room and payment method.' });
      return;
    }
    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const booking = await transaction.booking.findUnique({
            where: { id: id.data },
          });
          if (!booking) throw new BookingRuleError('Booking not found.', 404);
          if (!(
            booking.status === BookingStatus.PENDING ||
            booking.status === BookingStatus.CONFIRMED
          )) {
            throw new BookingRuleError(
              'This booking cannot be checked in.',
              409,
            );
          }
          const roomId = body.data.roomId ?? booking.roomId;
          if (!roomId) {
            throw new BookingRuleError('Assign a room before check-in.', 400);
          }
          const room = await transaction.room.findUnique({
            where: { id: roomId },
            include: {
              roomType: { include: { rates: true } },
              rateOverrides: true,
            },
          });
          if (!room) throw new BookingRuleError('Room not found.', 404);
          if (room.operationalStatus !== RoomOperationalStatus.ACTIVE) {
            throw new BookingRuleError(
              'This room is not available for check-in.',
              409,
            );
          }
          if (
            await transaction.stay.findUnique({
              where: { activeRoomId: room.id },
            })
          ) {
            throw new BookingRuleError('This room is already occupied.', 409);
          }
          let pricing;
          try {
            pricing = resolveStayPricing(
              room,
              booking.numberOfDays != null
                ? { numberOfDays: booking.numberOfDays }
                : { durationHours: booking.expectedDurationHours },
            );
          } catch (error: unknown) {
            if (error instanceof StayPricingError) {
              throw new BookingRuleError(error.message, 400);
            }
            throw error;
          }
          const checkedInAt = new Date();
          const shiftWindow = getShiftWindow(checkedInAt);
          const shift = await transaction.shift.upsert({
            where: { startsAt: shiftWindow.startsAt },
            update: { type: shiftWindow.type, endsAt: shiftWindow.endsAt },
            create: shiftWindow,
          });
          const stay = await transaction.stay.create({
            data: {
              roomId: room.id,
              activeRoomId: room.id,
              shiftId: shift.id,
              checkedInById: request.authUser.id,
              status: StayStatus.ACTIVE,
              arrivalType:
                body.data.arrivalType ??
                booking.arrivalType ??
                ArrivalType.WALK_IN,
              vehicleType:
                (body.data.arrivalType ?? booking.arrivalType) ===
                ArrivalType.VEHICLE
                  ? (body.data.vehicleType ?? booking.vehicleType)
                  : null,
              guestName: booking.guestName,
              plateNumber:
                (body.data.arrivalType ?? booking.arrivalType) ===
                ArrivalType.VEHICLE
                  ? booking.plateNumber
                  : null,
              notes: booking.notes,
              durationHours: pricing.durationHours,
              numberOfDays: pricing.numberOfDays,
              rateAmountCentavos: pricing.rateAmountCentavos,
              paidAmountCentavos: pricing.totalAmountCentavos,
              checkedInAt,
              expectedCheckoutAt: new Date(
                checkedInAt.getTime() + pricing.durationHours * 60 * 60 * 1000,
              ),
            },
          });
          await transaction.financialTransaction.create({
            data: {
              stayId: stay.id,
              handledById: request.authUser.id,
              transactionType: FinancialTransactionType.ROOM_CHARGE,
              amountCentavos: pricing.totalAmountCentavos,
              paymentMethod: body.data.paymentMethod,
              note: `Booking ${booking.bookingReference ?? `#${booking.id}`}`,
            },
          });
          const updatedBooking = await transaction.booking.update({
            where: { id: booking.id },
            data: {
              roomId: room.id,
              status: BookingStatus.ARRIVED,
              convertedStayId: stay.id,
              updatedByUserId: request.authUser.id,
            },
            include: bookingInclude,
          });
          await transaction.auditLog.create({
            data: {
              staffId: request.authUser.id,
              action: 'BOOKING_TO_STAY',
              entityType: 'BOOKING',
              entityId: String(booking.id),
              details: {
                roomId: room.id,
                stayId: stay.id,
                numberOfDays: pricing.numberOfDays,
                rateAmountCentavos: pricing.rateAmountCentavos,
                amountCentavos: pricing.totalAmountCentavos,
                paymentMethod: body.data.paymentMethod,
              },
            },
          });
          return { booking: updatedBooking, stay };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      response.status(201).json({ data: result });
    } catch (error: unknown) {
      if (error instanceof BookingRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        response
          .status(409)
          .json({ message: 'This room is no longer available.' });
        return;
      }
      throw error;
    }
  });

  return router;
}
