import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Environment } from './config/env.js';
import type { DatabaseCheck } from './routes/health.js';
import { createHealthRouter } from './routes/health.js';

export function createApp(
  environment: Environment,
  checkDatabase: DatabaseCheck,
): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: environment.CLIENT_URL }));
  app.use(express.json());
  app.use('/api/health', createHealthRouter(checkDatabase));

  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found.' });
  });

  return app;
}
