import { Prisma, StaffRole, type PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

const createSchema = z.object({
  username: z.string().trim().min(2).max(50),
  password: z.string().min(8).max(200),
  role: z.nativeEnum(StaffRole),
});
const updateSchema = z.object({
  username: z.string().trim().min(2).max(50).optional(),
  password: z.string().min(8).max(200).optional(),
  role: z.nativeEnum(StaffRole).optional(),
  isActive: z.boolean().optional(),
});
const publicSelect = {
  id: true,
  username: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

export function createStaffRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.get('/', async (_request, response) => {
    response.json({
      data: await prisma.staffAccount.findMany({
        select: publicSelect,
        orderBy: { id: 'asc' },
      }),
    });
  });

  router.post('/', async (request, response) => {
    const result = createSchema.safeParse(request.body);
    if (!result.success) {
      response.status(400).json({
        message: result.error.issues.map((issue) => issue.message).join(' '),
      });
      return;
    }
    try {
      const staff = await prisma.staffAccount.create({
        data: {
          username: result.data.username,
          passwordHash: await hash(result.data.password, 12),
          role: result.data.role,
        },
        select: publicSelect,
      });
      await prisma.auditLog.create({
        data: {
          staffId: request.authUser?.id,
          action: 'STAFF_CREATE',
          entityType: 'STAFF',
          entityId: String(staff.id),
        },
      });
      response.status(201).json({ data: staff });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response.status(409).json({ message: 'That username already exists.' });
        return;
      }
      throw error;
    }
  });

  router.patch('/:id', async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = updateSchema.safeParse(request.body);
    if (!id.success || !body.success || Object.keys(body.data).length === 0) {
      response.status(400).json({ message: 'Provide a valid staff update.' });
      return;
    }
    if (
      id.data === request.authUser.id &&
      (body.data.isActive === false || body.data.role === StaffRole.FRONT_DESK)
    ) {
      response.status(400).json({
        message: 'You cannot disable or demote your own Owner account.',
      });
      return;
    }
    const data: Prisma.StaffAccountUpdateInput = {
      ...(body.data.username ? { username: body.data.username } : {}),
      ...(body.data.password
        ? { passwordHash: await hash(body.data.password, 12) }
        : {}),
      ...(body.data.role ? { role: body.data.role } : {}),
      ...(body.data.isActive !== undefined
        ? { isActive: body.data.isActive }
        : {}),
    };
    const staff = await prisma.staffAccount.update({
      where: { id: id.data },
      data,
      select: publicSelect,
    });
    if (body.data.isActive === false)
      await prisma.session.deleteMany({ where: { staffId: id.data } });
    await prisma.auditLog.create({
      data: {
        staffId: request.authUser?.id,
        action: 'STAFF_UPDATE',
        entityType: 'STAFF',
        entityId: String(staff.id),
      },
    });
    response.json({ data: staff });
  });
  return router;
}
