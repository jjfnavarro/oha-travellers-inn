import { createHash } from 'node:crypto';
import { StaffRole, type PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';

export const SESSION_COOKIE = 'oha_session';

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function requireAuth(prisma: PrismaClient): RequestHandler {
  return async (request, response, next) => {
    const token = request.cookies[SESSION_COOKIE] as string | undefined;
    if (!token) {
      response.status(401).json({ message: 'Please sign in to continue.' });
      return;
    }

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { staff: true },
    });
    if (
      !session ||
      session.expiresAt <= new Date() ||
      !session.staff.isActive
    ) {
      if (session) await prisma.session.delete({ where: { id: session.id } });
      response.clearCookie(SESSION_COOKIE);
      response
        .status(401)
        .json({ message: 'Your session has expired. Please sign in again.' });
      return;
    }

    request.authUser = {
      id: session.staff.id,
      username: session.staff.username,
      role: session.staff.role,
    };
    next();
  };
}

export const requireOwner: RequestHandler = (request, response, next) => {
  if (request.authUser?.role !== StaffRole.OWNER) {
    response.status(403).json({ message: 'Owner access is required.' });
    return;
  }
  next();
};
