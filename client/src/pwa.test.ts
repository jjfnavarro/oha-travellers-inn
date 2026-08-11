import { beforeEach, describe, expect, test, vi } from 'vitest';
import { registerServiceWorker } from './pwa';

describe('PWA registration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('registers the service worker after the page loads', async () => {
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    registerServiceWorker(true);
    window.dispatchEvent(new Event('load'));
    await Promise.resolve();

    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  test('removes stale service workers during local development', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations },
    });

    registerServiceWorker(false);
    await vi.waitFor(() => expect(unregister).toHaveBeenCalledOnce());
  });
});
