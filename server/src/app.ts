import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
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
import { requireAuth, requireOwner } from './middleware/auth.js';
import type { PrismaClient } from '@prisma/client';

export function createApp(
  environment: Environment,
  checkDatabase: DatabaseCheck,
  databaseClient?: PrismaClient,
): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: environment.CLIENT_URL, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/health', createHealthRouter(checkDatabase));
  if (databaseClient) {
    app.use('/api/auth', createAuthRouter(databaseClient, environment));
    app.use('/api', requireAuth(databaseClient));
    app.use('/api/room-types', createRoomTypesRouter(databaseClient));
    app.use('/api/rooms', createRoomsRouter(databaseClient));
    app.use('/api/stays', createStaysRouter(databaseClient));
    app.use('/api/shifts', createShiftsRouter(databaseClient));
    app.use('/api/reports', requireOwner, createReportsRouter(databaseClient));
    app.use('/api/staff', requireOwner, createStaffRouter(databaseClient));
    app.use('/api/audit', requireOwner, createAuditRouter(databaseClient));
  }

  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found.' });
  });

  return app;
}
