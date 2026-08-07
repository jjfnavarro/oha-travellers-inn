import {
  ArrivalType,
  Prisma,
  RoomOperationalStatus,
  StayStatus,
  type PrismaClient,
} from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

const checkInSchema = z.object({
  roomId: z.number().int().positive(),
  durationHours: z.number().int().positive().max(24),
  arrivalType: z.nativeEnum(ArrivalType),
  guestName: z.string().trim().max(100).optional().nullable(),
  plateNumber: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const stayInclude = {
  room: {
    include: {
      roomType: {
        include: { rates: { orderBy: { durationHours: 'asc' as const } } },
      },
    },
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
          const expectedCheckoutAt = new Date(
            checkedInAt.getTime() + result.data.durationHours * 60 * 60 * 1000,
          );

          return transaction.stay.create({
            data: {
              roomId: room.id,
              activeRoomId: room.id,
              status: StayStatus.ACTIVE,
              arrivalType: result.data.arrivalType,
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

  router.post('/:id/check-out', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ message: 'Invalid stay ID.' });
      return;
    }

    const checkedOutAt = new Date();
    const update = await prisma.stay.updateMany({
      where: { id: id.data, status: StayStatus.ACTIVE },
      data: { status: StayStatus.COMPLETED, checkedOutAt, activeRoomId: null },
    });
    if (update.count === 0) {
      response.status(409).json({
        message: 'This stay is not active or has already checked out.',
      });
      return;
    }

    const stay = await prisma.stay.findUnique({
      where: { id: id.data },
      include: stayInclude,
    });
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
