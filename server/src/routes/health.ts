import { Router } from 'express';

export type DatabaseCheck = () => Promise<void>;

export function createHealthRouter(checkDatabase: DatabaseCheck): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    try {
      await checkDatabase();
      response.status(200).json({
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      console.error('Database health check failed:', error);
      response.status(503).json({
        status: 'error',
        database: 'unavailable',
        message: 'The database is currently unavailable.',
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
