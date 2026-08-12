import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { MiniStoreView } from './MiniStoreView';

vi.mock('react-easy-crop', () => ({
  default: () => <div data-testid="image-crop-area" />,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('sells a selected product with server-bound purchase details', async () => {
  Object.defineProperty(window.crypto, 'randomUUID', {
    configurable: true,
    value: () => '550e8400-e29b-41d4-a716-446655440000',
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 7,
              name: 'Bottled Water',
              category: 'STORE_PRODUCT',
              sellingPriceCentavos: 2_500,
              imageUrl: null,
              isActive: true,
            },
          ],
        }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ data: { id: 9 }, repeated: false }),
    });
  vi.stubGlobal('fetch', fetch);

  render(
    <MiniStoreView
      isOwner={false}
      rooms={[{ id: 22, number: '22', stays: [{ id: 10 }] }]}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: /Purchase/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
  fireEvent.change(screen.getByLabelText(/Link to active room/), {
    target: { value: '10' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'GCash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));

  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const request = fetch.mock.calls[1]?.[1] as RequestInit;
  expect(JSON.parse(String(request.body))).toEqual({
    productId: 7,
    quantity: 2,
    paymentMethod: 'GCASH',
    stayId: 10,
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  });
  expect(await screen.findByText(/2 × Bottled Water sold/)).toBeInTheDocument();
});

test('requires an occupied room before purchasing an extra charge', async () => {
  Object.defineProperty(window.crypto, 'randomUUID', {
    configurable: true,
    value: () => '550e8400-e29b-41d4-a716-446655440000',
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 8,
              name: 'Extra Pillow',
              category: 'EXTRA_CHARGE',
              sellingPriceCentavos: 5_000,
              imageUrl: null,
              isActive: true,
            },
          ],
        }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ data: { id: 10 }, repeated: false }),
    });
  vi.stubGlobal('fetch', fetch);

  render(
    <MiniStoreView
      isOwner={false}
      rooms={[{ id: 22, number: '22', stays: [{ id: 10 }] }]}
    />,
  );
  expect(
    await screen.findByRole('heading', { name: 'Store' }),
  ).toBeInTheDocument();
  expect(screen.queryByText('Mini Store')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Purchase/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
  expect(
    screen.getByText('Select an occupied room for this extra charge.'),
  ).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);

  fireEvent.change(screen.getByLabelText('Occupied room (required)'), {
    target: { value: '10' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'GCash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));

  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const request = fetch.mock.calls[1]?.[1] as RequestInit;
  expect(JSON.parse(String(request.body))).toMatchObject({
    productId: 8,
    paymentMethod: 'GCASH',
    stayId: 10,
  });
});

test('opens a square crop workflow before accepting an Owner image', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    }),
  );
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:product-image'),
    revokeObjectURL: vi.fn(),
  });

  render(<MiniStoreView isOwner rooms={[]} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Manage products' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Add product' }));
  const fileInput =
    document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(fileInput).not.toBeNull();
  fireEvent.change(fileInput!, {
    target: {
      files: [new File(['image'], 'product.jpg', { type: 'image/jpeg' })],
    },
  });

  const cropDialog = await screen.findByRole('dialog', { name: 'Crop image' });
  expect(within(cropDialog).getByTestId('image-crop-area')).toBeInTheDocument();
  fireEvent.click(within(cropDialog).getByRole('button', { name: 'Cancel' }));
  expect(
    screen.queryByRole('dialog', { name: 'Crop image' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('dialog', { name: 'Add product' }),
  ).toBeInTheDocument();
});
