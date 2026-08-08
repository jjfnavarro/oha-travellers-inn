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
  number: z.string().trim().min(1).max(10),
  roomTypeId: z.number().int().positive(),
  displayOrder: z.number().int().positive(),
  operationalStatus: z.nativeEnum(RoomOperationalStatus),
});

const roomInclude = {
  roomType: {
    include: { rates: { orderBy: { durationHours: 'asc' as const } } },
  },
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
      const room = await prisma.room.create({
        data: result.data,
        include: roomInclude,
      });
      response.status(201).json({ data: room });
    } catch (error: unknown) {
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
    try {
      const existingRoom = await prisma.room.findUnique({
        where: { id: id.data },
        select: { operationalStatus: true },
      });
      if (!existingRoom) {
        response.status(404).json({ message: 'Room not found.' });
        return;
      }
      if (body.data.operationalStatus !== undefined) {
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
        const updatedRoom = await transaction.room.update({
          where: { id: id.data },
          data,
          include: roomInclude,
        });
        const action =
          existingRoom.operationalStatus === RoomOperationalStatus.CLEANING &&
          updatedRoom.operationalStatus === RoomOperationalStatus.ACTIVE
            ? 'MARK_ROOM_AVAILABLE'
            : updatedRoom.operationalStatus === RoomOperationalStatus.CLEANING
              ? 'MARK_ROOM_CLEANING'
              : 'ROOM_STATUS_UPDATE';
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser?.id,
            action,
            entityType: 'ROOM',
            entityId: String(updatedRoom.id),
            details: {
              previousValue: existingRoom.operationalStatus,
              newValue: updatedRoom.operationalStatus,
            },
          },
        });
        return updatedRoom;
      });
      response.json({ data: room });
    } catch (error: unknown) {
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

  return router;
}
