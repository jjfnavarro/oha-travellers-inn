import {
  Prisma,
  RoomOperationalStatus,
  StaffRole,
  type PrismaClient,
} from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireOwner } from '../middleware/auth.js';

const roomSchema = z.object({
  number: z.string().trim().min(1).max(30),
  roomTypeId: z.number().int().positive(),
  displayOrder: z.number().int().positive(),
  operationalStatus: z.nativeEnum(RoomOperationalStatus),
});

const roomRatesSchema = z.object({
  overrides: z.array(
    z.object({
      durationHours: z.number().int().positive().max(24),
      amountCentavos: z.number().int().positive(),
    }),
  ),
});

const roomInclude = {
  roomType: {
    include: { rates: { orderBy: { durationHours: 'asc' as const } } },
  },
  rateOverrides: { orderBy: { durationHours: 'asc' as const } },
  stays: {
    where: { status: 'ACTIVE' as const },
    orderBy: { checkedInAt: 'desc' as const },
    take: 1,
    include: {
      extensions: { orderBy: { createdAt: 'asc' as const } },
    },
  },
};

export function createRoomsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    const status = z
      .nativeEnum(RoomOperationalStatus)
      .safeParse(request.query.status);
    const rooms = await prisma.room.findMany({
      ...(status.success ? { where: { operationalStatus: status.data } } : {}),
      include: roomInclude,
      orderBy: { displayOrder: 'asc' },
    });
    response.json({ data: rooms });
  });

  router.get('/:id', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ message: 'Invalid room ID.' });
      return;
    }
    const room = await prisma.room.findUnique({
      where: { id: id.data },
      include: roomInclude,
    });
    if (!room) {
      response.status(404).json({ message: 'Room not found.' });
      return;
    }
    response.json({ data: room });
  });

  router.post('/', requireOwner, async (request, response) => {
    const result = roomSchema.safeParse(request.body);
    if (!result.success) {
      response.status(400).json({
        message: result.error.issues.map((issue) => issue.message).join(' '),
      });
      return;
    }
    try {
      const room = await prisma.$transaction(async (transaction) => {
        const created = await transaction.room.create({
          data: result.data,
          include: roomInclude,
        });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action: 'ROOM_CREATE',
            entityType: 'ROOM',
            entityId: String(created.id),
            details: {
              number: created.number,
              roomTypeId: created.roomTypeId,
              displayOrder: created.displayOrder,
              operationalStatus: created.operationalStatus,
            },
          },
        });
        return created;
      });
      response.status(201).json({ data: room });
    } catch (error: unknown) {
      if (error instanceof RoomRateRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response.status(409).json({
          message: 'The room number or display order already exists.',
        });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        response
          .status(400)
          .json({ message: 'The selected room type does not exist.' });
        return;
      }
      throw error;
    }
  });

  router.patch('/:id/rates', requireOwner, async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = roomRatesSchema.safeParse(request.body);
    if (!id.success || !body.success) {
      response
        .status(400)
        .json({ message: 'Provide valid room rate overrides.' });
      return;
    }
    const durations = body.data.overrides.map((rate) => rate.durationHours);
    if (new Set(durations).size !== durations.length) {
      response
        .status(400)
        .json({ message: 'Each duration can only be overridden once.' });
      return;
    }
    try {
      const room = await prisma.$transaction(async (transaction) => {
        const previous = await transaction.room.findUnique({
          where: { id: id.data },
          include: roomInclude,
        });
        if (!previous) throw new RoomRateRuleError('Room not found.', 404);
        const offeredDurations = new Set(
          previous.roomType.rates.map((rate) => rate.durationHours),
        );
        if (durations.some((duration) => !offeredDurations.has(duration))) {
          throw new RoomRateRuleError(
            'A room can only override durations offered by its room type.',
            400,
          );
        }
        await transaction.roomRateOverride.deleteMany({
          where: { roomId: previous.id },
        });
        if (body.data.overrides.length > 0) {
          await transaction.roomRateOverride.createMany({
            data: body.data.overrides.map((rate) => ({
              roomId: previous.id,
              ...rate,
            })),
          });
        }
        const updated = await transaction.room.findUniqueOrThrow({
          where: { id: previous.id },
          include: roomInclude,
        });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action: 'ROOM_RATE_UPDATE',
            entityType: 'ROOM',
            entityId: String(previous.id),
            details: {
              previousValue: previous.rateOverrides.map((rate) => ({
                durationHours: rate.durationHours,
                amountCentavos: rate.amountCentavos,
              })),
              newValue: body.data.overrides,
            },
          },
        });
        return updated;
      });
      response.json({ data: room });
    } catch (error: unknown) {
      if (error instanceof RoomRateRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  router.patch('/:id', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = roomSchema.partial().safeParse(request.body);
    if (!id.success || !body.success || Object.keys(body.data).length === 0) {
      response.status(400).json({
        message: 'Provide a valid room ID and at least one field to update.',
      });
      return;
    }
    if (
      request.authUser?.role === StaffRole.FRONT_DESK &&
      Object.keys(body.data).some((key) => key !== 'operationalStatus')
    ) {
      response.status(403).json({
        message: 'Front-desk accounts can only change operational status.',
      });
      return;
    }
    if (
      request.authUser.role === StaffRole.FRONT_DESK &&
      body.data.operationalStatus === RoomOperationalStatus.INACTIVE
    ) {
      response
        .status(403)
        .json({ message: 'Only the Owner can archive a room.' });
      return;
    }
    try {
      const existingRoom = await prisma.room.findUnique({
        where: { id: id.data },
        include: { _count: { select: { stays: true, bookings: true } } },
      });
      if (!existingRoom) {
        response.status(404).json({ message: 'Room not found.' });
        return;
      }
      if (
        request.authUser.role === StaffRole.FRONT_DESK &&
        existingRoom.operationalStatus === RoomOperationalStatus.INACTIVE
      ) {
        response.status(403).json({
          message: 'Only the Owner can restore an archived room.',
        });
        return;
      }
      const identityChanged =
        (body.data.number !== undefined &&
          body.data.number !== existingRoom.number) ||
        (body.data.roomTypeId !== undefined &&
          body.data.roomTypeId !== existingRoom.roomTypeId);
      if (
        body.data.operationalStatus !== undefined &&
        body.data.operationalStatus !== existingRoom.operationalStatus
      ) {
        const activeStay = await prisma.stay.findUnique({
          where: { activeRoomId: id.data },
        });
        if (activeStay) {
          response.status(409).json({
            message:
              'Check out the active stay before changing this room’s operational status.',
          });
          return;
        }
      }
      const data: Prisma.RoomUncheckedUpdateInput = {
        ...(body.data.number !== undefined ? { number: body.data.number } : {}),
        ...(body.data.roomTypeId !== undefined
          ? { roomTypeId: body.data.roomTypeId }
          : {}),
        ...(body.data.displayOrder !== undefined
          ? { displayOrder: body.data.displayOrder }
          : {}),
        ...(body.data.operationalStatus !== undefined
          ? { operationalStatus: body.data.operationalStatus }
          : {}),
      };
      const room = await prisma.$transaction(async (transaction) => {
        if (
          body.data.roomTypeId !== undefined &&
          body.data.roomTypeId !== existingRoom.roomTypeId
        ) {
          const roomType = await transaction.roomType.findUnique({
            where: { id: body.data.roomTypeId },
            select: { rates: { select: { durationHours: true } } },
          });
          if (!roomType) {
            throw new RoomRateRuleError(
              'The selected room type does not exist.',
              400,
            );
          }
          await transaction.roomRateOverride.deleteMany({
            where: {
              roomId: existingRoom.id,
              durationHours: {
                notIn: roomType.rates.map((rate) => rate.durationHours),
              },
            },
          });
        }
        const updatedRoom = await transaction.room.update({
          where: { id: id.data },
          data,
          include: roomInclude,
        });
        const action = identityChanged
          ? 'ROOM_EDIT'
          : updatedRoom.operationalStatus === RoomOperationalStatus.INACTIVE
            ? 'ROOM_ARCHIVE'
            : existingRoom.operationalStatus ===
                  RoomOperationalStatus.INACTIVE &&
                updatedRoom.operationalStatus === RoomOperationalStatus.ACTIVE
              ? 'ROOM_RESTORE'
              : existingRoom.operationalStatus ===
                    RoomOperationalStatus.CLEANING &&
                  updatedRoom.operationalStatus === RoomOperationalStatus.ACTIVE
                ? 'MARK_ROOM_AVAILABLE'
                : updatedRoom.operationalStatus ===
                    RoomOperationalStatus.CLEANING
                  ? 'MARK_ROOM_CLEANING'
                  : 'ROOM_STATUS_UPDATE';
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser?.id,
            action,
            entityType: 'ROOM',
            entityId: String(updatedRoom.id),
            details: {
              previousValue: {
                number: existingRoom.number,
                roomTypeId: existingRoom.roomTypeId,
                displayOrder: existingRoom.displayOrder,
                operationalStatus: existingRoom.operationalStatus,
              },
              newValue: {
                number: updatedRoom.number,
                roomTypeId: updatedRoom.roomTypeId,
                displayOrder: updatedRoom.displayOrder,
                operationalStatus: updatedRoom.operationalStatus,
              },
            },
          },
        });
        return updatedRoom;
      });
      response.json({ data: room });
    } catch (error: unknown) {
      if (error instanceof RoomRateRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        response.status(404).json({ message: 'Room not found.' });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response.status(409).json({
          message: 'The room number or display order already exists.',
        });
        return;
      }
      throw error;
    }
  });

  router.delete('/:id', requireOwner, async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ message: 'Invalid room ID.' });
      return;
    }
    try {
      const deleted = await prisma.$transaction(async (transaction) => {
        const room = await transaction.room.findUnique({
          where: { id: id.data },
          include: {
            roomType: { select: { name: true } },
            _count: { select: { stays: true, bookings: true } },
          },
        });
        if (!room) throw new RoomRateRuleError('Room not found.', 404);
        const operationalHistory = await transaction.auditLog.count({
          where: {
            entityType: 'ROOM',
            entityId: String(room.id),
            action: { notIn: ['ROOM_CREATE', 'ROOM_EDIT', 'ROOM_RATE_UPDATE'] },
          },
        });
        if (
          room._count.stays > 0 ||
          room._count.bookings > 0 ||
          operationalHistory > 0
        ) {
          throw new RoomRateRuleError(
            'This room has operational history and cannot be permanently deleted. Archive it instead.',
            409,
          );
        }
        await transaction.room.delete({ where: { id: room.id } });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action: 'ROOM_DELETE',
            entityType: 'ROOM',
            entityId: String(room.id),
            details: {
              number: room.number,
              roomType: room.roomType.name,
              roomTypeId: room.roomTypeId,
              displayOrder: room.displayOrder,
            },
          },
        });
        return room;
      });
      response.json({ data: { id: deleted.id, number: deleted.number } });
    } catch (error: unknown) {
      if (error instanceof RoomRateRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  return router;
}

class RoomRateRuleError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
