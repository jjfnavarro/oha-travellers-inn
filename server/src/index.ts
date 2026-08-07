import 'dotenv/config';
import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { checkDatabaseConnection, prisma } from './database/prisma.js';

const environment = loadEnvironment();
const app = createApp(environment, checkDatabaseConnection, prisma);

const server = app.listen(environment.PORT, () => {
  console.log(`OHA server listening on http://localhost:${environment.PORT}`);
});

async function shutDown(signal: string): Promise<void> {
  console.log(`${signal} received. Shutting down...`);
  server.close(async (error) => {
    await prisma.$disconnect();

    if (error) {
      console.error('Server shutdown failed:', error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => void shutDown('SIGINT'));
process.on('SIGTERM', () => void shutDown('SIGTERM'));
