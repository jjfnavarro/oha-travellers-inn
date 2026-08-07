import type { StaffRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      authUser: { id: number; username: string; role: StaffRole };
    }
  }
}

export {};
