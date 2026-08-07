import { useEffect, useState } from 'react';

type ConnectionState = 'checking' | 'connected' | 'error';

interface HealthResponse {
  status: 'ok';
  database: 'connected';
  timestamp: string;
}

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

function isHealthyResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;
  return response.status === 'ok' && response.database === 'connected';
}

export default function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('checking');

  useEffect(() => {
    const controller = new AbortController();

    async function checkConnection() {
      try {
        const response = await fetch(`${apiUrl}/health`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Health check failed with status ${response.status}.`,
          );
        }

        const data: unknown = await response.json();
        if (!isHealthyResponse(data)) {
          throw new Error('The server returned an invalid health response.');
        }

        setConnectionState('connected');
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setConnectionState('error');
      }
    }

    void checkConnection();
    return () => controller.abort();
  }, []);

  return (
    <main className="page-shell">
      <section className="status-panel" aria-live="polite">
        <p className="eyebrow">Front Desk System</p>
        <h1>OHA Traveller's Inn</h1>
        {connectionState === 'checking' && (
          <p className="status checking">Checking system connection...</p>
        )}
        {connectionState === 'connected' && (
          <p className="status connected">System Connected</p>
        )}
        {connectionState === 'error' && (
          <p className="status error">
            System unavailable. Check that the backend and MySQL are running,
            then refresh this page.
          </p>
        )}
      </section>
    </main>
  );
}
