import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import type { Environment } from './config/env.js';
import type { DatabaseCheck } from './routes/health.js';
import { createHealthRouter } from './routes/health.js';
import { createRoomTypesRouter } from './routes/room-types.js';
import { createRoomsRouter } from './routes/rooms.js';
import { createStaysRouter } from './routes/stays.js';
import { createShiftsRouter } from './routes/shifts.js';
import { createReportsRouter } from './routes/reports.js';
import { createAuthRouter } from './routes/auth.js';
import { createStaffRouter } from './routes/staff.js';
import { createAuditRouter } from './routes/audit.js';
import { createBookingsRouter } from './routes/bookings.js';
import { requireAuth, requireOwner } from './middleware/auth.js';
import type { PrismaClient } from '@prisma/client';

export function createApp(
  environment: Environment,
  checkDatabase: DatabaseCheck,
  databaseClient?: PrismaClient,
): Express {
  const app = express();

  if (environment.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: environment.CLIENT_URL, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/health', createHealthRouter(checkDatabase));
  if (databaseClient) {
    app.use('/api/auth', createAuthRouter(databaseClient, environment));
    app.use('/api', requireAuth(databaseClient));
    app.use('/api/room-types', createRoomTypesRouter(databaseClient));
    app.use('/api/rooms', createRoomsRouter(databaseClient));
    app.use('/api/stays', createStaysRouter(databaseClient));
    app.use('/api/bookings', createBookingsRouter(databaseClient));
    app.use('/api/shifts', requireOwner, createShiftsRouter(databaseClient));
    app.use('/api/reports', requireOwner, createReportsRouter(databaseClient));
    app.use('/api/staff', requireOwner, createStaffRouter(databaseClient));
    app.use('/api/audit', requireOwner, createAuditRouter(databaseClient));
  }

  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found.' });
  });

  const unexpectedErrorHandler: ErrorRequestHandler = (
    error: unknown,
    request,
    response,
    _next,
  ) => {
    void _next;
    const details =
      error instanceof Error
        ? environment.NODE_ENV === 'production'
          ? { name: error.name, message: error.message }
          : { name: error.name, message: error.message, stack: error.stack }
        : { message: 'Non-error value thrown.' };
    console.error('Unexpected server error', {
      method: request.method,
      path: request.path,
      ...details,
    });
    if (!response.headersSent) {
      response.status(500).json({
        message: 'The request could not be completed. Please try again.',
      });
    }
  };
  app.use(unexpectedErrorHandler);

  return app;
}
