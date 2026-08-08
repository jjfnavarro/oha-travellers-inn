import { afterEach, describe, expect, test, vi } from 'vitest';
import { apiRequest } from './api';

afterEach(() => {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  vi.unstubAllGlobals();
});

describe('offline transaction safety', () => {
  test('blocks writes before they reach the API while offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      apiRequest('/stays/check-in', {
        method: 'POST',
        body: '{}',
      }),
    ).rejects.toThrow('The system is offline');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('reports an unreachable API as a connection error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed')));

    await expect(apiRequest('/rooms')).rejects.toThrow(
      'The server could not be reached. Check the connection and try again.',
    );
  });
});
