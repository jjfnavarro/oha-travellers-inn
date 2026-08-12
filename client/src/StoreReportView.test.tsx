import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { StoreReportView } from './StoreReportView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('recovers from a failed report request when Retry is selected', async () => {
  let reportAttempts = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/staff')) {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as Response;
    }

    reportAttempts += 1;
    if (reportAttempts === 1) {
      return {
        ok: false,
        status: 503,
        json: () => Promise.resolve({ message: 'Report service unavailable.' }),
      } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            selectedStaff: null,
            filters: { label: 'Today', shift: 'ALL' },
            summary: {
              storeRevenueCentavos: 15_000,
              extraChargesRevenueCentavos: 0,
              totalRevenueCentavos: 15_000,
              salesCount: 2,
              itemsSold: 3,
            },
            revenueTrend: [
              {
                key: '2026-08-11T00:00:00.000Z',
                label: '8 AM',
                roomRevenueCentavos: 0,
                extensionRevenueCentavos: 0,
                storeRevenueCentavos: 15_000,
                extraChargesRevenueCentavos: 0,
                totalRevenueCentavos: 15_000,
              },
            ],
            paymentMethods: [],
            products: [],
            staff: [],
            activity: [],
          },
        }),
    } as Response;
  });
  vi.stubGlobal('fetch', fetch);

  render(<StoreReportView />);

  expect(
    screen.getByRole('heading', { name: 'Store reports' }),
  ).toBeInTheDocument();
  expect(screen.queryByText('Mini Store reports')).not.toBeInTheDocument();

  expect(
    await screen.findByText('Store report unavailable.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findAllByText('₱150')).toHaveLength(2);
  expect(reportAttempts).toBe(2);
});
