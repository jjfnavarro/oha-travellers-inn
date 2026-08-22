import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { LostFoundView } from './LostFoundView';

const rooms = [
  { id: 5, number: '5', operationalStatus: 'CLEANING' as const },
  { id: 8, number: 'Transient 1', operationalStatus: 'INACTIVE' as const },
];

const item = {
  id: 9,
  itemName: 'Black Charger',
  description: 'USB-C charger found beside the bed',
  roomId: 5,
  room: rooms[0],
  stayId: null,
  stay: null,
  foundAt: '2026-08-23T02:15:00.000Z',
  recordedBy: { id: 2, username: 'Dodong' },
  status: 'UNCLAIMED',
  notes: 'Held at front desk',
  claimedAt: null,
  claimedByName: null,
  claimNotes: null,
  claimProcessedBy: null,
  disposedAt: null,
  disposalNotes: null,
  disposedBy: null,
  createdAt: '2026-08-23T02:16:00.000Z',
  updatedAt: '2026-08-23T02:16:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('defaults to Unclaimed and searches item, description, or room', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: [item] }),
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <LostFoundView
      role="FRONT_DESK"
      rooms={rooms}
      initialRoomId={null}
      onInitialRoomHandled={vi.fn()}
    />,
  );

  expect(await screen.findByText('Black Charger')).toBeInTheDocument();
  expect(screen.getByLabelText('Status')).toHaveValue('UNCLAIMED');
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'Room 5' },
  });
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes('q=Room+5')),
    ).toBe(true),
  );
});

test('records an item with a preselected Cleaning room and optional stay', async () => {
  const handled = vi.fn();
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/eligible-stays')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 20,
                guestName: 'Test Guest',
                checkedInAt: '2026-08-22T02:00:00.000Z',
                checkedOutAt: '2026-08-23T02:00:00.000Z',
              },
            ],
          }),
      });
    }
    if (init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ data: item }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <LostFoundView
      role="FRONT_DESK"
      rooms={rooms}
      initialRoomId={5}
      onInitialRoomHandled={handled}
    />,
  );

  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog).getByRole('heading', { name: 'Record found item' }),
  ).toBeInTheDocument();
  expect(handled).toHaveBeenCalledOnce();
  expect(within(dialog).getByLabelText('Room')).toHaveValue('5');
  fireEvent.change(within(dialog).getByLabelText('Item name'), {
    target: { value: 'Black Charger' },
  });
  fireEvent.change(within(dialog).getByLabelText('Description'), {
    target: { value: 'USB-C charger found beside the bed' },
  });
  await waitFor(() =>
    expect(within(dialog).getByLabelText(/Associated stay/)).toHaveTextContent(
      'Test Guest',
    ),
  );
  fireEvent.change(within(dialog).getByLabelText(/Associated stay/), {
    target: { value: '20' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save item' }));

  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([, options]) => options?.method === 'POST'),
    ).toBe(true),
  );
  const post = fetch.mock.calls.find(
    ([, options]) => options?.method === 'POST',
  );
  const body = JSON.parse(String(post?.[1]?.body)) as Record<string, unknown>;
  expect(body).toEqual(
    expect.objectContaining({
      itemName: 'Black Charger',
      roomId: 5,
      stayId: 20,
    }),
  );
  expect(body).not.toHaveProperty('paymentMethod');
});

test('hides disposal and deletion controls from Front Desk', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [item] }),
    }),
  );
  render(
    <LostFoundView
      role="FRONT_DESK"
      rooms={rooms}
      initialRoomId={null}
      onInitialRoomHandled={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'View details' }));
  expect(
    screen.getByRole('button', { name: 'Mark claimed' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Dispose' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Delete' }),
  ).not.toBeInTheDocument();
});
