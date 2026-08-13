import { describe, expect, test } from 'vitest';

import { interactiveTransactionOptions } from './prisma.js';

describe('Prisma transaction configuration', () => {
  test('allows production transactions to tolerate remote database latency', () => {
    expect(interactiveTransactionOptions).toEqual({
      maxWait: 10_000,
      timeout: 30_000,
    });
  });
});
