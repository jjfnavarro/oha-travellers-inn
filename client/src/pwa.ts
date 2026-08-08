export function registerServiceWorker(enabled = import.meta.env.PROD): void {
  if (!enabled || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error(
        'Service worker registration failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    });
  });
}
