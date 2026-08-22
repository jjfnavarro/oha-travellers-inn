import {
  LostFoundStatus,
  Prisma,
  StaffRole,
  StayStatus,
  type PrismaClient,
} from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireOwner } from '../middleware/auth.js';

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional().nullable();

const createSchema = z
  .object({
    itemName: z.string().trim().min(1).max(100),
    description: optionalText(1000),
    roomId: z.number().int().positive(),
    stayId: z.number().int().positive().optional().nullable(),
    foundAt: z.coerce.date(),
    notes: optionalText(1000),
  })
  .strict();

const editSchema = z
  .object({
    itemName: z.string().trim().min(1).max(100).optional(),
    description: optionalText(1000),
    roomId: z.number().int().positive().optional(),
    stayId: z.number().int().positive().optional().nullable(),
    foundAt: z.coerce.date().optional(),
    notes: optionalText(1000),
  })
  .strict();

const claimSchema = z
  .object({
    claimedByName: optionalText(100),
    notes: optionalText(1000),
  })
  .strict();

const disposalSchema = z
  .object({ notes: z.string().trim().min(1).max(1000) })
  .strict();

const deletionSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.nativeEnum(LostFoundStatus).optional(),
  roomId: z.coerce.number().int().positive().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const itemInclude = {
  room: {
    select: { id: true, number: true, operationalStatus: true },
  },
  stay: {
    select: {
      id: true,
      guestName: true,
      status: true,
      checkedInAt: true,
      checkedOutAt: true,
    },
  },
  recordedBy: { select: { id: true, username: true } },
  claimProcessedBy: { select: { id: true, username: true } },
  disposedBy: { select: { id: true, username: true } },
} satisfies Prisma.LostFoundItemInclude;

function cleanOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function ensureFoundAtIsValid(foundAt: Date): void {
  if (foundAt.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new LostFoundRuleError('Found time cannot be in the future.', 400);
  }
}

async function validateRoomAndStay(
  prisma: Prisma.TransactionClient,
  roomId: number,
  stayId: number | null,
): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true },
  });
  if (!room) throw new LostFoundRuleError('Room not found.', 404);
  if (stayId === null) return;
  const stay = await prisma.stay.findFirst({
    where: { id: stayId, roomId, status: StayStatus.COMPLETED },
    select: { id: true },
  });
  if (!stay) {
    throw new LostFoundRuleError(
      'The selected completed stay does not belong to this room.',
      400,
    );
  }
}

export function createLostFoundRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/eligible-stays', async (request, response) => {
    const roomId = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(request.query.roomId);
    if (!roomId.success) {
      response.status(400).json({ message: 'Select a valid room.' });
      return;
    }
    const room = await prisma.room.findUnique({
      where: { id: roomId.data },
      select: { id: true },
    });
    if (!room) {
      response.status(404).json({ message: 'Room not found.' });
      return;
    }
    const stays = await prisma.stay.findMany({
      where: { roomId: room.id, status: StayStatus.COMPLETED },
      select: {
        id: true,
        guestName: true,
        checkedInAt: true,
        checkedOutAt: true,
      },
      orderBy: { checkedOutAt: 'desc' },
      take: 10,
    });
    response.json({ data: stays });
  });

  router.get('/', async (request, response) => {
    const query = listSchema.safeParse(request.query);
    if (!query.success) {
      response
        .status(400)
        .json({ message: 'Lost & Found filters are invalid.' });
      return;
    }
    const search = query.data.q;
    const roomSearch = search?.replace(/^room\s+/i, '').trim();
    const items = await prisma.lostFoundItem.findMany({
      where: {
        ...(query.data.status ? { status: query.data.status } : {}),
        ...(query.data.roomId ? { roomId: query.data.roomId } : {}),
        ...(query.data.from || query.data.to
          ? {
              foundAt: {
                ...(query.data.from ? { gte: query.data.from } : {}),
                ...(query.data.to ? { lte: query.data.to } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { itemName: { contains: search } },
                { description: { contains: search } },
                { notes: { contains: search } },
                { room: { number: { equals: roomSearch || search } } },
              ],
            }
          : {}),
      },
      include: itemInclude,
      orderBy: [{ status: 'asc' }, { foundAt: 'desc' }],
      take: 500,
    });
    response.json({ data: items });
  });

  router.get('/:id', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ message: 'Invalid Lost & Found ID.' });
      return;
    }
    const item = await prisma.lostFoundItem.findUnique({
      where: { id: id.data },
      include: itemInclude,
    });
    if (!item) {
      response.status(404).json({ message: 'Lost & Found item not found.' });
      return;
    }
    response.json({ data: item });
  });

  router.post('/', async (request, response) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({
        message: body.error.issues.map((issue) => issue.message).join(' '),
      });
      return;
    }
    try {
      ensureFoundAtIsValid(body.data.foundAt);
      const item = await prisma.$transaction(async (transaction) => {
        const stayId = body.data.stayId ?? null;
        await validateRoomAndStay(transaction, body.data.roomId, stayId);
        const created = await transaction.lostFoundItem.create({
          data: {
            itemName: body.data.itemName,
            description: cleanOptionalText(body.data.description),
            roomId: body.data.roomId,
            stayId,
            foundAt: body.data.foundAt,
            recordedById: request.authUser.id,
            notes: cleanOptionalText(body.data.notes),
          },
          include: itemInclude,
        });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action: 'LOST_FOUND_CREATE',
            entityType: 'LOST_FOUND_ITEM',
            entityId: String(created.id),
            details: {
              itemName: created.itemName,
              roomId: created.roomId,
              stayId: created.stayId,
              foundAt: created.foundAt,
            },
          },
        });
        return created;
      });
      response.status(201).json({ data: item });
    } catch (error: unknown) {
      handleRuleError(error, response);
    }
  });

  router.patch('/:id', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = editSchema.safeParse(request.body);
    if (!id.success || !body.success || Object.keys(body.data).length === 0) {
      response.status(400).json({ message: 'Provide valid fields to update.' });
      return;
    }
    if (
      request.authUser.role === StaffRole.FRONT_DESK &&
      body.data.foundAt !== undefined
    ) {
      response
        .status(403)
        .json({ message: 'Only the Owner can change found time.' });
      return;
    }
    try {
      if (body.data.foundAt) ensureFoundAtIsValid(body.data.foundAt);
      const item = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.lostFoundItem.findUnique({
          where: { id: id.data },
        });
        if (!existing) {
          throw new LostFoundRuleError('Lost & Found item not found.', 404);
        }
        if (
          request.authUser.role === StaffRole.FRONT_DESK &&
          existing.status !== LostFoundStatus.UNCLAIMED
        ) {
          throw new LostFoundRuleError(
            'Staff can only edit an unclaimed item.',
            409,
          );
        }
        const roomId = body.data.roomId ?? existing.roomId;
        const stayId =
          body.data.stayId === undefined ? existing.stayId : body.data.stayId;
        await validateRoomAndStay(transaction, roomId, stayId);
        const updated = await transaction.lostFoundItem.update({
          where: { id: existing.id },
          data: {
            ...(body.data.itemName !== undefined
              ? { itemName: body.data.itemName }
              : {}),
            ...(body.data.description !== undefined
              ? { description: cleanOptionalText(body.data.description) }
              : {}),
            ...(body.data.roomId !== undefined ? { roomId } : {}),
            ...(body.data.stayId !== undefined ? { stayId } : {}),
            ...(body.data.foundAt !== undefined
              ? { foundAt: body.data.foundAt }
              : {}),
            ...(body.data.notes !== undefined
              ? { notes: cleanOptionalText(body.data.notes) }
              : {}),
          },
          include: itemInclude,
        });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action: 'LOST_FOUND_EDIT',
            entityType: 'LOST_FOUND_ITEM',
            entityId: String(existing.id),
            details: {
              previousValue: {
                itemName: existing.itemName,
                description: existing.description,
                roomId: existing.roomId,
                stayId: existing.stayId,
                foundAt: existing.foundAt,
                notes: existing.notes,
              },
              newValue: {
                itemName: updated.itemName,
                description: updated.description,
                roomId: updated.roomId,
                stayId: updated.stayId,
                foundAt: updated.foundAt,
                notes: updated.notes,
              },
            },
          },
        });
        return updated;
      });
      response.json({ data: item });
    } catch (error: unknown) {
      handleRuleError(error, response);
    }
  });

  router.post('/:id/claim', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = claimSchema.safeParse(request.body);
    if (!id.success || !body.success) {
      response.status(400).json({ message: 'Claim details are invalid.' });
      return;
    }
    try {
      const claimedAt = new Date();
      const item = await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.lostFoundItem.findUnique({
            where: { id: id.data },
          });
          if (!existing) {
            throw new LostFoundRuleError('Lost & Found item not found.', 404);
          }
          const result = await transaction.lostFoundItem.updateMany({
            where: { id: existing.id, status: LostFoundStatus.UNCLAIMED },
            data: {
              status: LostFoundStatus.CLAIMED,
              claimedAt,
              claimedByName: cleanOptionalText(body.data.claimedByName),
              claimNotes: cleanOptionalText(body.data.notes),
              claimProcessedById: request.authUser.id,
            },
          });
          if (result.count !== 1) {
            throw new LostFoundRuleError(
              'Only an unclaimed item can be marked claimed.',
              409,
            );
          }
          const updated = await transaction.lostFoundItem.findUniqueOrThrow({
            where: { id: existing.id },
            include: itemInclude,
          });
          await transaction.auditLog.create({
            data: {
              staffId: request.authUser.id,
              action: 'LOST_FOUND_CLAIM',
              entityType: 'LOST_FOUND_ITEM',
              entityId: String(existing.id),
              details: {
                roomId: existing.roomId,
                claimedAt,
                claimedByName: updated.claimedByName,
                notes: updated.claimNotes,
              },
            },
          });
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      response.json({ data: item });
    } catch (error: unknown) {
      handleRuleError(error, response);
    }
  });

  router.post('/:id/dispose', requireOwner, async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = disposalSchema.safeParse(request.body);
    if (!id.success || !body.success) {
      response.status(400).json({ message: 'Provide a disposal reason.' });
      return;
    }
    try {
      const disposedAt = new Date();
      const item = await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.lostFoundItem.findUnique({
            where: { id: id.data },
          });
          if (!existing) {
            throw new LostFoundRuleError('Lost & Found item not found.', 404);
          }
          const result = await transaction.lostFoundItem.updateMany({
            where: { id: existing.id, status: LostFoundStatus.UNCLAIMED },
            data: {
              status: LostFoundStatus.DISPOSED,
              disposedAt,
              disposalNotes: body.data.notes,
              disposedById: request.authUser.id,
            },
          });
          if (result.count !== 1) {
            throw new LostFoundRuleError(
              'Only an unclaimed item can be disposed.',
              409,
            );
          }
          const updated = await transaction.lostFoundItem.findUniqueOrThrow({
            where: { id: existing.id },
            include: itemInclude,
          });
          await transaction.auditLog.create({
            data: {
              staffId: request.authUser.id,
              action: 'LOST_FOUND_DISPOSE',
              entityType: 'LOST_FOUND_ITEM',
              entityId: String(existing.id),
              details: {
                roomId: existing.roomId,
                disposedAt,
                notes: updated.disposalNotes,
              },
            },
          });
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      response.json({ data: item });
    } catch (error: unknown) {
      handleRuleError(error, response);
    }
  });

  router.delete('/:id', requireOwner, async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = deletionSchema.safeParse(request.body);
    if (!id.success || !body.success) {
      response.status(400).json({ message: 'Provide a deletion reason.' });
      return;
    }
    try {
      const deleted = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.lostFoundItem.findUnique({
          where: { id: id.data },
        });
        if (!existing) {
          throw new LostFoundRuleError('Lost & Found item not found.', 404);
        }
        if (existing.status !== LostFoundStatus.UNCLAIMED) {
          throw new LostFoundRuleError(
            'Only an unclaimed mistaken or duplicate record can be deleted.',
            409,
          );
        }
        await transaction.lostFoundItem.delete({ where: { id: existing.id } });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action: 'LOST_FOUND_DELETE',
            entityType: 'LOST_FOUND_ITEM',
            entityId: String(existing.id),
            details: {
              reason: body.data.reason,
              itemName: existing.itemName,
              roomId: existing.roomId,
              stayId: existing.stayId,
              foundAt: existing.foundAt,
            },
          },
        });
        return existing;
      });
      response.json({ data: { id: deleted.id } });
    } catch (error: unknown) {
      handleRuleError(error, response);
    }
  });

  return router;
}

function handleRuleError(error: unknown, response: import('express').Response) {
  if (error instanceof LostFoundRuleError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  throw error;
}

class LostFoundRuleError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
