import { expect, test } from 'vitest';
import { resolveHistoryWindow } from './history-period';

test('resolves operational today, Sunday week, and month windows', () => {
  expect(resolveHistoryWindow('TODAY', '2026-08-11')).toEqual({
    from: '2026-08-11T00:00:00.000Z',
    to: '2026-08-11T23:59:59.999Z',
  });
  expect(resolveHistoryWindow('WEEK', '2026-08-11')).toEqual({
    from: '2026-08-09T00:00:00.000Z',
    to: '2026-08-15T23:59:59.999Z',
  });
  expect(resolveHistoryWindow('MONTH', '2026-08-11')).toEqual({
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-31T23:59:59.999Z',
  });
});

test('supports all history and custom operational dates', () => {
  expect(resolveHistoryWindow('ALL', '2026-08-11')).toEqual({});
  expect(
    resolveHistoryWindow('CUSTOM', '2026-08-11', '2026-08-07', '2026-08-09'),
  ).toEqual({
    from: '2026-08-07T00:00:00.000Z',
    to: '2026-08-09T23:59:59.999Z',
  });
});
