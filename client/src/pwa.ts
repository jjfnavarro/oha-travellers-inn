export function registerServiceWorker(enabled = import.meta.env.PROD): void {
  if (!('serviceWorker' in navigator)) return;

  if (!enabled) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations.map((registration) => registration.unregister()),
        ),
      )
      .catch((error: unknown) => {
        console.error(
          'Stale service worker cleanup failed:',
          error instanceof Error ? error.message : 'Unknown error',
        );
      });
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error(
        'Service worker registration failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    });
  });
}
