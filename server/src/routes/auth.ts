import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { compare } from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import type { Environment } from '../config/env.js';
import {
  hashSessionToken,
  requireAuth,
  SESSION_COOKIE,
} from '../middleware/auth.js';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export function createAuthRouter(
  prisma: PrismaClient,
  environment: Environment,
): Router {
  const router = Router();

  router.post('/login', async (request, response) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      response
        .status(400)
        .json({ message: 'Enter your username and password.' });
      return;
    }

    const staff = await prisma.staffAccount.findUnique({
      where: { username: result.data.username },
    });
    if (
      !staff ||
      !staff.isActive ||
      !(await compare(result.data.password, staff.passwordHash))
    ) {
      response
        .status(401)
        .json({ message: 'Username or password is incorrect.' });
      return;
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.session.create({
        data: {
          tokenHash: hashSessionToken(token),
          staffId: staff.id,
          expiresAt,
        },
      }),
      prisma.auditLog.create({
        data: { staffId: staff.id, action: 'LOGIN', entityType: 'SESSION' },
      }),
      prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
    ]);

    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: environment.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
    response.json({
      data: { id: staff.id, username: staff.username, role: staff.role },
    });
  });

  router.get('/me', requireAuth(prisma), (request, response) => {
    response.json({ data: request.authUser });
  });

  router.post('/logout', requireAuth(prisma), async (request, response) => {
    const token = request.cookies[SESSION_COOKIE] as string;
    await prisma.$transaction([
      prisma.session.deleteMany({
        where: { tokenHash: hashSessionToken(token) },
      }),
      prisma.auditLog.create({
        data: {
          staffId: request.authUser?.id,
          action: 'LOGOUT',
          entityType: 'SESSION',
        },
      }),
    ]);
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    response.status(204).send();
  });

  return router;
}
