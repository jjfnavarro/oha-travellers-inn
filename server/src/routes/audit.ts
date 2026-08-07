import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';

export function createAuditRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.get('/', async (_request, response) => {
    const logs = await prisma.auditLog.findMany({
      include: { staff: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    response.json({ data: logs });
  });
  return router;
}
