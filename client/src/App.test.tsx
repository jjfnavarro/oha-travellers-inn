import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
  expect(
    screen.queryByRole('button', { name: 'Enable sound' }),
  ).not.toBeInTheDocument();
});

test('shows the staff login when there is no authenticated session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

  render(<App />);

  expect(
    await screen.findByRole('heading', { name: 'Staff login' }),
  ).toBeInTheDocument();
});

test('keeps a floating sidebar control available while navigation is hidden', async () => {
  window.localStorage.setItem('oha-sidebar-collapsed', 'true');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith('/auth/me')
        ? { id: 1, username: 'Zack', role: 'OWNER' }
        : url.endsWith('/health')
          ? {
              status: 'ok',
              database: 'connected',
              timestamp: new Date().toISOString(),
            }
          : [];

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data }),
      });
    }),
  );

  const { container } = render(<App />);

  await screen.findByRole('heading', { name: 'Room inventory' });
  const floatingTrigger = container.querySelector<HTMLButtonElement>(
    '.sidebar-floating-trigger',
  );

  expect(floatingTrigger).not.toBeNull();
  expect(container.querySelector('.app-shell')).toHaveClass(
    'sidebar-collapsed',
  );
  fireEvent.click(floatingTrigger!);
  expect(container.querySelector('.app-shell')).not.toHaveClass(
    'sidebar-collapsed',
  );
});

test('shows Owner reporting controls and financial transaction totals', async () => {
  const storeReport = {
    selectedStaff: null,
    filters: { label: 'Today', shift: 'ALL' },
    summary: {
      storeRevenueCentavos: 15_000,
      extraChargesRevenueCentavos: 5_000,
      totalRevenueCentavos: 20_000,
      salesCount: 2,
      itemsSold: 3,
    },
    revenueTrend: [
      {
        key: '2026-08-08T00:00:00.000Z',
        label: '8 AM',
        roomRevenueCentavos: 0,
        extensionRevenueCentavos: 0,
        storeRevenueCentavos: 15_000,
        extraChargesRevenueCentavos: 5_000,
        totalRevenueCentavos: 20_000,
      },
    ],
    paymentMethods: [],
    products: [],
    staff: [],
    activity: [],
  };
  const report = {
    generatedAt: '2026-08-08T05:00:00.000Z',
    viewMode: 'OVERALL',
    selectedStaff: null,
    filters: {
      preset: 'today',
      shift: 'ALL',
      startsAt: '2026-08-08T00:00:00.000Z',
      endsAt: '2026-08-09T00:00:00.000Z',
      label: 'Today',
    },
    summary: {
      totalCheckIns: 2,
      completedStays: 1,
      activeStays: 1,
      totalRoomUses: 2,
      uniqueRoomsUsed: 2,
      walkInCount: 1,
      vehicleCount: 1,
      extensionCount: 1,
      overdueCheckoutCount: 0,
    },
    financial: {
      grossRoomRevenueCentavos: 75_000,
      extensionRevenueCentavos: 25_000,
      storeRevenueCentavos: 0,
      extraChargesRevenueCentavos: 0,
      grossRevenueCentavos: 100_000,
      netRevenueCentavos: 100_000,
      totalCollectedCentavos: 100_000,
    },
    revenueTrend: [
      {
        key: '2026-08-08T00:00:00.000Z',
        label: '8 AM',
        roomRevenueCentavos: 75_000,
        extensionRevenueCentavos: 25_000,
        storeRevenueCentavos: 0,
        extraChargesRevenueCentavos: 0,
        totalRevenueCentavos: 100_000,
      },
    ],
    packages: [
      { durationHours: 3, count: 1, revenueCentavos: 25_000 },
      { durationHours: 6, count: 1, revenueCentavos: 50_000 },
    ],
    roomUsage: [{ roomId: 1, roomNumber: '1', roomType: 'Standard', uses: 1 }],
    paymentMethods: [
      { method: 'CASH', count: 2, amountCentavos: 50_000 },
      { method: 'GCASH', count: 1, amountCentavos: 50_000 },
    ],
    vehicleTypes: [],
    activity: [],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith('/auth/me')
        ? { id: 1, username: 'Zack', role: 'OWNER' }
        : url.endsWith('/rooms') || url.endsWith('/room-types')
          ? []
          : url.endsWith('/staff')
            ? [
                {
                  id: 2,
                  username: 'Along',
                  role: 'FRONT_DESK',
                  isActive: true,
                  createdAt: '2026-08-01T00:00:00.000Z',
                  updatedAt: '2026-08-01T00:00:00.000Z',
                },
              ]
            : url.includes('/reports/owner')
              ? report
              : url.includes('/reports/store')
                ? storeReport
                : {
                    status: 'ok',
                    database: 'connected',
                    timestamp: '2026-08-08T05:00:00.000Z',
                  };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data }),
      } as Response);
    }),
  );

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Reports/ }));

  expect(
    await screen.findByRole('heading', { name: 'Reports' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Report type')).toHaveValue('OVERALL');
  expect(screen.getByLabelText('Payment method')).toHaveValue('ALL');
  expect(
    screen.queryByRole('button', { name: 'Store reports' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Total revenue')).toBeInTheDocument();
  expect(screen.getAllByText('₱1,000').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'By staff' }));
  expect(await screen.findByLabelText('Staff account')).toHaveValue('2');
  fireEvent.change(screen.getByLabelText('Payment method'), {
    target: { value: 'GCASH' },
  });
  expect(screen.getByLabelText('Payment method')).toHaveValue('GCASH');
  fireEvent.change(screen.getByLabelText('Report type'), {
    target: { value: 'STORE' },
  });
  expect(await screen.findByText('Items sold')).toBeInTheDocument();
});

test('shows bookings and opens the touch-friendly booking form', async () => {
  const room = {
    id: 1,
    number: '1',
    displayOrder: 1,
    operationalStatus: 'ACTIVE',
    roomTypeId: 1,
    stays: [],
    roomType: {
      id: 1,
      name: 'Standard',
      description: null,
      rates: [{ id: 1, durationHours: 3, amountCentavos: 25_000 }],
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith('/auth/me')
        ? { id: 2, username: 'Dodong', role: 'FRONT_DESK' }
        : url.endsWith('/rooms')
          ? [room]
          : url.endsWith('/room-types')
            ? [room.roomType]
            : url.endsWith('/products')
              ? []
              : url.includes('/stays/history')
                ? []
                : url.includes('/bookings')
                  ? []
                  : {
                      status: 'ok',
                      database: 'connected',
                      timestamp: new Date().toISOString(),
                    };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data }),
      } as Response);
    }),
  );

  render(<App />);
  expect(
    screen.queryByRole('button', { name: 'Enable sound' }),
  ).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: /^Store$/ }));
  expect(
    await screen.findByRole('heading', { name: 'Store' }),
  ).toBeInTheDocument();

  fireEvent.click(await screen.findByRole('button', { name: /Stay history/ }));
  expect(await screen.findByLabelText('Period')).toHaveValue('TODAY');
  fireEvent.change(screen.getByLabelText('Period'), {
    target: { value: 'WEEK' },
  });
  expect(screen.getByLabelText('Period')).toHaveValue('WEEK');

  fireEvent.click(await screen.findByRole('button', { name: /Bookings/ }));

  expect(
    await screen.findByRole('heading', { name: 'Bookings' }),
  ).toBeInTheDocument();
  expect(await screen.findByText("Today's bookings")).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add booking' }));
  expect(
    screen.getByRole('heading', { name: 'Add booking' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/Guest name/)).not.toBeRequired();
  expect(screen.getByLabelText(/Room/)).not.toBeRequired();
});

test('shows linked extra-charge details in stay history', async () => {
  const roomType = {
    id: 1,
    name: 'Standard',
    description: null,
    rates: [{ id: 1, durationHours: 3, amountCentavos: 25_000 }],
  };
  const room = {
    id: 1,
    number: '1',
    displayOrder: 1,
    operationalStatus: 'ACTIVE',
    roomTypeId: 1,
    stays: [],
    roomType,
  };
  const historyStay = {
    id: 10,
    roomId: 1,
    arrivalType: 'WALK_IN',
    vehicleType: null,
    guestName: null,
    plateNumber: null,
    durationHours: 3,
    paidAmountCentavos: 25_000,
    checkedInAt: '2026-08-12T00:00:00.000Z',
    expectedCheckoutAt: '2026-08-12T03:00:00.000Z',
    checkedOutAt: null,
    status: 'ACTIVE',
    extensions: [],
    room,
    shift: { type: 'DAY' },
    checkedInBy: { id: 2, username: 'Dodong' },
    checkedOutBy: null,
    storeSales: [
      {
        id: 20,
        paymentMethod: 'GCASH',
        totalAmountCentavos: 5_000,
        createdAt: '2026-08-12T02:00:00.000Z',
        handledBy: { id: 2, username: 'Dodong' },
        items: [
          {
            id: 30,
            productNameSnapshot: 'Extra Pillow',
            categorySnapshot: 'EXTRA_CHARGE',
            unitPriceCentavos: 5_000,
            quantity: 1,
            lineTotalCentavos: 5_000,
          },
        ],
      },
    ],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith('/auth/me')
        ? { id: 1, username: 'Zack', role: 'OWNER' }
        : url.endsWith('/rooms')
          ? [room]
          : url.endsWith('/room-types')
            ? [roomType]
            : url.includes('/stays/history')
              ? [historyStay]
              : {
                  status: 'ok',
                  database: 'connected',
                  timestamp: new Date().toISOString(),
                };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data }),
      } as Response);
    }),
  );

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Stay history/ }));

  expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument();
  expect(await screen.findByText('1 × Extra Pillow')).toBeInTheDocument();
  expect(screen.getByText(/GCash/)).toBeInTheDocument();
  expect(screen.getByText(/Dodong ·/)).toBeInTheDocument();
});

test('shows a prominent checkout alert when a stay is due soon', async () => {
  const oscillatorStart = vi.fn();
  const gainNode = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  gainNode.connect.mockReturnValue(gainNode);
  const oscillatorNode = {
    type: 'sine',
    frequency: { value: 0, setValueAtTime: vi.fn() },
    connect: vi.fn(() => gainNode),
    start: oscillatorStart,
    stop: vi.fn(),
  };
  const fakeAudioContext = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => oscillatorNode),
    createGain: vi.fn(() => gainNode),
  };
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => fakeAudioContext),
  );
  const expectedCheckoutAt = new Date(Date.now() + 4 * 60_000).toISOString();
  const room = {
    id: 1,
    number: '1',
    displayOrder: 1,
    operationalStatus: 'ACTIVE',
    roomTypeId: 1,
    stays: [
      {
        id: 9,
        roomId: 1,
        arrivalType: 'WALK_IN',
        guestName: null,
        plateNumber: null,
        durationHours: 3,
        paidAmountCentavos: 25_000,
        paymentMethod: 'CASH',
        checkedInAt: new Date(Date.now() - 176 * 60_000).toISOString(),
        expectedCheckoutAt,
        extensions: [],
      },
    ],
    roomType: {
      id: 1,
      name: 'Standard',
      description: null,
      rates: [{ id: 1, durationHours: 3, amountCentavos: 25_000 }],
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith('/auth/me')
        ? { id: 2, username: 'Dodong', role: 'FRONT_DESK' }
        : url.endsWith('/rooms')
          ? [room]
          : url.endsWith('/room-types')
            ? [room.roomType]
            : {
                status: 'ok',
                database: 'connected',
                timestamp: new Date().toISOString(),
              };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data }),
      } as Response);
    }),
  );

  render(<App />);

  expect(
    await screen.findByRole('heading', { name: 'Checkout alerts' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Room 1')).toBeInTheDocument();
  expect(screen.getAllByText(/Checkout soon/).length).toBeGreaterThan(0);
  expect(
    screen.queryByRole('button', { name: 'Enable sound' }),
  ).not.toBeInTheDocument();

  fireEvent.pointerDown(window);
  await waitFor(() => expect(oscillatorStart).toHaveBeenCalledOnce());
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
    expectedCheckoutAt: '2026-08-07T10:09:00.000Z',
  };

  expect(getOccupancyStatus(stay, now)).toBe('DUE_SOON');
  expect(
    getOccupancyStatus(
      { ...stay, expectedCheckoutAt: '2026-08-07T10:11:00.000Z' },
      now,
    ),
  ).toBe('OCCUPIED');
  expect(
    getOccupancyStatus(
      { ...stay, expectedCheckoutAt: '2026-08-07T09:59:00.000Z' },
      now,
    ),
  ).toBe('OVERDUE');

  const afterTabletWake = Date.parse('2026-08-07T10:10:00.000Z');
  expect(getOccupancyStatus(stay, afterTabletWake)).toBe('OVERDUE');
});

test('refreshes authoritative room data when the PWA becomes visible', async () => {
  let roomRequests = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/rooms')) roomRequests += 1;
      const data = url.endsWith('/auth/me')
        ? { id: 2, username: 'Dodong', role: 'FRONT_DESK' }
        : url.endsWith('/rooms') || url.endsWith('/room-types')
          ? []
          : {
              status: 'ok',
              database: 'connected',
              timestamp: new Date().toISOString(),
            };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data }),
      } as Response);
    }),
  );

  render(<App />);
  await screen.findByText('System Connected');
  expect(roomRequests).toBe(1);

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  document.dispatchEvent(new Event('visibilitychange'));

  await waitFor(() => expect(roomRequests).toBe(2));
});
