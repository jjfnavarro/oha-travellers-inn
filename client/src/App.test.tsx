import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';
import { getOccupancyStatus } from './stay-status';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

test('shows the connected state when the API and database are healthy', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ data: { id: 1, username: 'Zack', role: 'OWNER' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString(),
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      }),
  );

  render(<App />);

  expect(
    await screen.findByRole('heading', { name: "OHA Traveller's Inn" }),
  ).toBeInTheDocument();
  expect(await screen.findByText('System Connected')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Room inventory' }),
  ).toBeInTheDocument();
});

test('shows the staff login when there is no authenticated session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

  render(<App />);

  expect(
    await screen.findByRole('heading', { name: 'Staff login' }),
  ).toBeInTheDocument();
});

test('calculates checkout-soon and overdue occupancy states', () => {
  const now = Date.parse('2026-08-07T10:00:00.000Z');
  const stay = {
    id: 1,
    roomId: 1,
    arrivalType: 'WALK_IN' as const,
    guestName: null,
    plateNumber: null,
    durationHours: 3,
    paidAmountCentavos: 25_000,
    checkedInAt: '2026-08-07T07:00:00.000Z',
    expectedCheckoutAt: '2026-08-07T10:04:00.000Z',
  };

  expect(getOccupancyStatus(stay, now)).toBe('DUE_SOON');
  expect(
    getOccupancyStatus(
      { ...stay, expectedCheckoutAt: '2026-08-07T09:59:00.000Z' },
      now,
    ),
  ).toBe('OVERDUE');
});
