import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('shows the connected state when the API and database are healthy', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          database: 'connected',
          timestamp: new Date().toISOString(),
        }),
    }),
  );

  render(<App />);

  expect(
    screen.getByRole('heading', { name: "OHA Traveller's Inn" }),
  ).toBeInTheDocument();
  expect(await screen.findByText('System Connected')).toBeInTheDocument();
});

test('shows a clear error when the API cannot be reached', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

  render(<App />);

  expect(await screen.findByText(/System unavailable/)).toBeInTheDocument();
});
