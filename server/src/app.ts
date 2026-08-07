import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Environment } from './config/env.js';
import type { DatabaseCheck } from './routes/health.js';
import { createHealthRouter } from './routes/health.js';
import { createRoomTypesRouter } from './routes/room-types.js';
import { createRoomsRouter } from './routes/rooms.js';
import { createStaysRouter } from './routes/stays.js';
import type { PrismaClient } from '@prisma/client';

export function createApp(
  environment: Environment,
  checkDatabase: DatabaseCheck,
  databaseClient?: PrismaClient,
): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: environment.CLIENT_URL }));
  app.use(express.json());
  app.use('/api/health', createHealthRouter(checkDatabase));
  if (databaseClient) {
    app.use('/api/room-types', createRoomTypesRouter(databaseClient));
    app.use('/api/rooms', createRoomsRouter(databaseClient));
    app.use('/api/stays', createStaysRouter(databaseClient));
  }

  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found.' });
  });

  return app;
}
