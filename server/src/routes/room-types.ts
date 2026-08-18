import { Prisma, type PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireOwner } from '../middleware/auth.js';
import {
  canonicalRoomTypeNames,
  configuredDurationsAreValid,
  normalizedRoomTypeName,
} from '../services/stay-pricing.js';

const rateSchema = z.object({
  durationHours: z.number().int().positive().max(24),
  amountCentavos: z.number().int().positive(),
});

const roomTypeSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(255).nullable().optional(),
  rates: z
    .array(rateSchema)
    .min(1)
    .refine(
      (rates) =>
        new Set(rates.map((rate) => rate.durationHours)).size === rates.length,
      'Each stay duration can only appear once.',
    ),
});

function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(' ');
}

function validateRatePolicy(name: string, rates: { durationHours: number }[]) {
  if (
    !configuredDurationsAreValid(
      name,
      rates.map((rate) => rate.durationHours),
    )
  ) {
    throw new RateRuleError(
      'Family and Transient room types must offer exactly 12-hour and 24-hour rates.',
      400,
    );
  }
}

export function createRoomTypesRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    const roomTypes = await prisma.roomType.findMany({
      include: {
        rates: { orderBy: { durationHours: 'asc' } },
        _count: { select: { rooms: true } },
      },
      orderBy: { id: 'asc' },
    });
    response.json({ data: roomTypes });
  });

  router.post('/', requireOwner, async (request, response) => {
    const result = roomTypeSchema.safeParse(request.body);
    if (!result.success) {
      response.status(400).json({ message: validationMessage(result.error) });
      return;
    }

    try {
      validateRatePolicy(result.data.name, result.data.rates);
      const roomType = await prisma.roomType.create({
        data: {
          name: result.data.name,
          description: result.data.description ?? null,
          rates: { create: result.data.rates },
        },
        include: { rates: true },
      });
      response.status(201).json({ data: roomType });
    } catch (error: unknown) {
      if (error instanceof RateRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response
          .status(409)
          .json({ message: 'A room type with this name already exists.' });
        return;
      }
      throw error;
    }
  });

  router.patch('/:id', requireOwner, async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = roomTypeSchema.safeParse(request.body);
    if (!id.success || !body.success) {
      response
        .status(400)
        .json({ message: 'Provide a valid room type and at least one rate.' });
      return;
    }

    try {
      const roomType = await prisma.$transaction(async (transaction) => {
        const previous = await transaction.roomType.findUnique({
          where: { id: id.data },
          include: { rates: { orderBy: { durationHours: 'asc' } } },
        });
        if (!previous) throw new RateRuleError('Room type not found.', 404);
        const previousName = normalizedRoomTypeName(previous.name);
        if (
          canonicalRoomTypeNames.includes(
            previousName as (typeof canonicalRoomTypeNames)[number],
          ) &&
          normalizedRoomTypeName(body.data.name) !== previousName
        ) {
          throw new RateRuleError(
            'Canonical room type names cannot be changed.',
            400,
          );
        }
        validateRatePolicy(body.data.name, body.data.rates);
        await transaction.stayRate.deleteMany({
          where: { roomTypeId: id.data },
        });
        await transaction.roomRateOverride.deleteMany({
          where: {
            room: { roomTypeId: id.data },
            durationHours: {
              notIn: body.data.rates.map((rate) => rate.durationHours),
            },
          },
        });
        const updated = await transaction.roomType.update({
          where: { id: id.data },
          data: {
            name: body.data.name,
            description: body.data.description ?? null,
            rates: { create: body.data.rates },
          },
          include: { rates: { orderBy: { durationHours: 'asc' } } },
        });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser?.id,
            action: 'RATE_UPDATE',
            entityType: 'ROOM_TYPE',
            entityId: String(id.data),
            details: {
              previousValue: {
                name: previous.name,
                description: previous.description,
                rates: previous.rates.map((rate) => ({
                  durationHours: rate.durationHours,
                  amountCentavos: rate.amountCentavos,
                })),
              },
              newValue: {
                name: updated.name,
                description: updated.description,
                rates: updated.rates.map((rate) => ({
                  durationHours: rate.durationHours,
                  amountCentavos: rate.amountCentavos,
                })),
              },
            },
          },
        });
        return updated;
      });
      response.json({ data: roomType });
    } catch (error: unknown) {
      if (error instanceof RateRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        response.status(404).json({ message: 'Room type not found.' });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response
          .status(409)
          .json({ message: 'A room type with this name already exists.' });
        return;
      }
      throw error;
    }
  });

  return router;
}

class RateRuleError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
