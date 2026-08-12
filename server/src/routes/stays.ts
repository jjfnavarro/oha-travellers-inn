import {
  ArrivalType,
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
import { getShiftWindow } from '../services/shift-time.js';
import { calculateExtendedCheckout } from '../services/stay-extension.js';

const checkInSchema = z.object({
  roomId: z.number().int().positive(),
  durationHours: z.number().int().positive().max(24),
  arrivalType: z.nativeEnum(ArrivalType),
  vehicleType: z.nativeEnum(VehicleType).optional().nullable(),
  guestName: z.string().trim().max(100).optional().nullable(),
  plateNumber: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  paymentMethod: z.enum([PaymentMethod.CASH, PaymentMethod.GCASH]),
});

const extensionSchema = z.object({
  durationHours: z.number().int().positive().max(24),
  paymentMethod: z.enum([PaymentMethod.CASH, PaymentMethod.GCASH]),
});

const stayInclude = {
  room: {
    include: {
      roomType: {
        include: { rates: { orderBy: { durationHours: 'asc' as const } } },
      },
    },
  },
  checkedInBy: { select: { id: true, username: true } },
  checkedOutBy: { select: { id: true, username: true } },
  extensions: {
    include: { createdBy: { select: { id: true, username: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  storeSales: {
    select: {
      id: true,
      paymentMethod: true,
      totalAmountCentavos: true,
      createdAt: true,
      handledBy: { select: { id: true, username: true } },
      items: {
        select: {
          id: true,
          productNameSnapshot: true,
          categorySnapshot: true,
          unitPriceCentavos: true,
          quantity: true,
          lineTotalCentavos: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function createStaysRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/active', async (_request, response) => {
    const stays = await prisma.stay.findMany({
      where: { status: StayStatus.ACTIVE },
      include: stayInclude,
      orderBy: { expectedCheckoutAt: 'asc' },
    });
    response.json({ data: stays });
  });

  router.get('/history', async (request, response) => {
    const query = z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        roomId: z.coerce.number().int().positive().optional(),
        roomTypeId: z.coerce.number().int().positive().optional(),
        status: z.nativeEnum(StayStatus).optional(),
        arrivalType: z.nativeEnum(ArrivalType).optional(),
      })
      .safeParse(request.query);
    if (!query.success) {
      response
        .status(400)
        .json({ message: 'One or more history filters are invalid.' });
      return;
    }

    const stays = await prisma.stay.findMany({
      where: {
        ...(query.data.from || query.data.to
          ? {
              checkedInAt: {
                ...(query.data.from ? { gte: query.data.from } : {}),
                ...(query.data.to ? { lte: query.data.to } : {}),
              },
            }
          : {}),
        ...(query.data.roomId ? { roomId: query.data.roomId } : {}),
        ...(query.data.roomTypeId
          ? { room: { roomTypeId: query.data.roomTypeId } }
          : {}),
        ...(query.data.status ? { status: query.data.status } : {}),
        ...(query.data.arrivalType
          ? { arrivalType: query.data.arrivalType }
          : {}),
      },
      include: { ...stayInclude, shift: true },
      orderBy: { checkedInAt: 'desc' },
      take: 500,
    });
    response.json({ data: stays });
  });

  router.post('/check-in', async (request, response) => {
    const result = checkInSchema.safeParse(request.body);
    if (!result.success) {
      response.status(400).json({
        message: result.error.issues.map((issue) => issue.message).join(' '),
      });
      return;
    }

    try {
      const stay = await prisma.$transaction(
        async (transaction) => {
          const room = await transaction.room.findUnique({
            where: { id: result.data.roomId },
            include: { roomType: { include: { rates: true } } },
          });

          if (!room) throw new StayRuleError('Room not found.', 404);
          if (room.operationalStatus !== RoomOperationalStatus.ACTIVE) {
            throw new StayRuleError(
              'This room is not available for check-in.',
              409,
            );
          }

          const existingStay = await transaction.stay.findUnique({
            where: { activeRoomId: room.id },
          });
          if (existingStay)
            throw new StayRuleError('This room is already occupied.', 409);

          const rate = room.roomType.rates.find(
            (item) => item.durationHours === result.data.durationHours,
          );
          if (!rate) {
            throw new StayRuleError(
              'The selected stay duration is not offered for this room.',
              400,
            );
          }

          const checkedInAt = new Date();
          const shiftWindow = getShiftWindow(checkedInAt);
          const shift = await transaction.shift.upsert({
            where: { startsAt: shiftWindow.startsAt },
            update: { type: shiftWindow.type, endsAt: shiftWindow.endsAt },
            create: shiftWindow,
          });
          const expectedCheckoutAt = new Date(
            checkedInAt.getTime() + result.data.durationHours * 60 * 60 * 1000,
          );

          const stay = await transaction.stay.create({
            data: {
              roomId: room.id,
              shiftId: shift.id,
              checkedInById: request.authUser?.id,
              activeRoomId: room.id,
              status: StayStatus.ACTIVE,
              arrivalType: result.data.arrivalType,
              vehicleType:
                result.data.arrivalType === ArrivalType.VEHICLE
                  ? (result.data.vehicleType ?? null)
                  : null,
              guestName: optionalText(result.data.guestName),
              plateNumber:
                optionalText(result.data.plateNumber)?.toUpperCase() ?? null,
              notes: optionalText(result.data.notes),
              durationHours: result.data.durationHours,
              paidAmountCentavos: rate.amountCentavos,
              checkedInAt,
              expectedCheckoutAt,
            },
            include: stayInclude,
          });

          await transaction.financialTransaction.create({
            data: {
              stayId: stay.id,
              handledById: request.authUser.id,
              transactionType: FinancialTransactionType.ROOM_CHARGE,
              amountCentavos: rate.amountCentavos,
              paymentMethod: result.data.paymentMethod,
            },
          });
          await transaction.auditLog.create({
            data: {
              staffId: request.authUser.id,
              action: 'CHECK_IN',
              entityType: 'STAY',
              entityId: String(stay.id),
              details: {
                roomId: stay.roomId,
                durationHours: stay.durationHours,
                amountCentavos: rate.amountCentavos,
                paymentMethod: result.data.paymentMethod,
              },
            },
          });
          return stay;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      response.status(201).json({ data: stay });
    } catch (error: unknown) {
      if (error instanceof StayRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response
          .status(409)
          .json({ message: 'This room is already occupied.' });
        return;
      }
      throw error;
    }
  });

  router.post('/:id/extensions', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = extensionSchema.safeParse(request.body);
    if (!id.success || !body.success) {
      response
        .status(400)
        .json({ message: 'Select a valid extension and payment method.' });
      return;
    }

    try {
      const stay = await prisma.$transaction(
        async (transaction) => {
          const activeStay = await transaction.stay.findFirst({
            where: { id: id.data, status: StayStatus.ACTIVE },
            include: {
              room: { include: { roomType: { include: { rates: true } } } },
            },
          });
          if (!activeStay) {
            throw new StayRuleError('This stay is no longer active.', 409);
          }
          const rate = activeStay.room.roomType.rates.find(
            (item) => item.durationHours === body.data.durationHours,
          );
          if (!rate) {
            throw new StayRuleError(
              'The selected extension is not offered for this room type.',
              400,
            );
          }

          const previousExpectedCheckoutAt = activeStay.expectedCheckoutAt;
          const extendedExpectedCheckoutAt = calculateExtendedCheckout(
            previousExpectedCheckoutAt,
            body.data.durationHours,
          );
          await transaction.stayExtension.create({
            data: {
              stayId: activeStay.id,
              createdById: request.authUser.id,
              durationHours: body.data.durationHours,
              amountCentavos: rate.amountCentavos,
              paymentMethod: body.data.paymentMethod,
              previousExpectedCheckoutAt,
              extendedExpectedCheckoutAt,
            },
          });
          await transaction.financialTransaction.create({
            data: {
              stayId: activeStay.id,
              handledById: request.authUser.id,
              transactionType: FinancialTransactionType.EXTENSION_CHARGE,
              amountCentavos: rate.amountCentavos,
              paymentMethod: body.data.paymentMethod,
            },
          });
          await transaction.auditLog.create({
            data: {
              staffId: request.authUser.id,
              action: 'EXTEND_STAY',
              entityType: 'STAY',
              entityId: String(activeStay.id),
              details: {
                roomId: activeStay.roomId,
                durationHours: body.data.durationHours,
                amountCentavos: rate.amountCentavos,
                paymentMethod: body.data.paymentMethod,
                previousExpectedCheckoutAt,
                extendedExpectedCheckoutAt,
              },
            },
          });
          return transaction.stay.update({
            where: { id: activeStay.id },
            data: {
              expectedCheckoutAt: extendedExpectedCheckoutAt,
              paidAmountCentavos: { increment: rate.amountCentavos },
            },
            include: stayInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      response.status(201).json({ data: stay });
    } catch (error: unknown) {
      if (error instanceof StayRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  router.post('/:id/check-out', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ message: 'Invalid stay ID.' });
      return;
    }

    const checkedOutAt = new Date();
    let stay: Awaited<ReturnType<typeof prisma.stay.findUnique>>;
    try {
      stay = await prisma.$transaction(async (transaction) => {
        const activeStay = await transaction.stay.findFirst({
          where: { id: id.data, status: StayStatus.ACTIVE },
        });
        if (!activeStay) {
          throw new StayRuleError(
            'This stay is not active or has already checked out.',
            409,
          );
        }
        const updatedStay = await transaction.stay.update({
          where: { id: activeStay.id },
          data: {
            status: StayStatus.COMPLETED,
            checkedOutAt,
            activeRoomId: null,
            checkedOutById: request.authUser.id,
          },
          include: stayInclude,
        });
        await transaction.room.update({
          where: { id: activeStay.roomId },
          data: { operationalStatus: RoomOperationalStatus.CLEANING },
        });
        await transaction.booking.updateMany({
          where: {
            convertedStayId: activeStay.id,
            status: 'ARRIVED',
          },
          data: {
            status: 'COMPLETED',
            updatedByUserId: request.authUser.id,
          },
        });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action: 'CHECK_OUT',
            entityType: 'STAY',
            entityId: String(activeStay.id),
            details: {
              early: checkedOutAt < activeStay.expectedCheckoutAt,
            },
          },
        });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action: 'MARK_ROOM_CLEANING',
            entityType: 'ROOM',
            entityId: String(activeStay.roomId),
            details: {
              previousValue: RoomOperationalStatus.ACTIVE,
              newValue: RoomOperationalStatus.CLEANING,
              stayId: activeStay.id,
            },
          },
        });
        return updatedStay;
      });
    } catch (error: unknown) {
      if (error instanceof StayRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      throw error;
    }
    response.json({ data: stay });
  });

  return router;
}

class StayRuleError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
