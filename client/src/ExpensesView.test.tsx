import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ExpensesView } from './ExpensesView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('records an expense without exposing a payment selector', async () => {
  Object.defineProperty(window.crypto, 'randomUUID', {
    configurable: true,
    value: () => '550e8400-e29b-41d4-a716-446655440000',
  });
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: () => Promise.resolve({ data: { id: 1 } }),
  });
  vi.stubGlobal('fetch', fetch);
  render(<ExpensesView isOwner={false} />);

  expect(screen.queryByText('GCash')).not.toBeInTheDocument();
  expect(screen.queryByText('Card')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Amount'), {
    target: { value: '500' },
  });
  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: 'Cleaning supplies' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));

  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<
    string,
    unknown
  >;
  expect(body).toEqual({
    amountCentavos: 50_000,
    reason: 'Cleaning supplies',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  });
});
