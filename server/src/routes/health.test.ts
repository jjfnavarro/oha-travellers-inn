import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';
import { createApp } from '../app.js';
import type { Environment } from '../config/env.js';

const environment: Environment = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: 'mysql://user:password@localhost:3306/test',
  SHADOW_DATABASE_URL: 'mysql://user:password@localhost:3306/test_shadow',
  CLIENT_URL: 'http://localhost:5173',
  BUSINESS_TIMEZONE: 'Asia/Manila',
};

describe('GET /api/health', () => {
  test('reports connected after a successful database query', async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined);
    const response = await request(createApp(environment, checkDatabase)).get(
      '/api/health',
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'connected',
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  test('returns 503 when the database query fails', async () => {
    const checkDatabase = vi
      .fn()
      .mockRejectedValue(new Error('Connection refused'));
    const response = await request(createApp(environment, checkDatabase)).get(
      '/api/health',
    );

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'error',
      database: 'unavailable',
    });
  });
});
