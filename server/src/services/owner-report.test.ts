import {
  ArrivalType,
  FinancialTransactionType,
  PaymentMethod,
  StaffRole,
  StayStatus,
  type PrismaClient,
} from '@prisma/client';
import { describe, expect, test, vi } from 'vitest';
import { buildOwnerReport, resolveOwnerReportWindow } from './owner-report.js';

const now = new Date('2026-08-08T05:00:00.000Z');

function database(): PrismaClient {
  const stays = [
    {
      id: 1,
      roomId: 1,
      status: StayStatus.COMPLETED,
      arrivalType: ArrivalType.WALK_IN,
      durationHours: 3,
      checkedInAt: new Date('2026-08-08T01:00:00.000Z'),
      expectedCheckoutAt: new Date('2026-08-08T04:00:00.000Z'),
      checkedOutAt: new Date('2026-08-08T04:00:00.000Z'),
      checkedInById: 1,
      checkedOutById: 2,
      room: { number: '1', roomType: { name: 'Standard' } },
      checkedInBy: { id: 1, username: 'Dodong' },
      checkedOutBy: { id: 2, username: 'Along' },
    },
    {
      id: 2,
      roomId: 2,
      status: StayStatus.ACTIVE,
      arrivalType: ArrivalType.VEHICLE,
      durationHours: 6,
      checkedInAt: new Date('2026-08-08T02:00:00.000Z'),
      expectedCheckoutAt: new Date('2026-08-08T03:00:00.000Z'),
      checkedOutAt: null,
      checkedInById: 2,
      checkedOutById: null,
      room: { number: '2', roomType: { name: 'Standard' } },
      checkedInBy: { id: 2, username: 'Along' },
      checkedOutBy: null,
    },
  ];
  const transactions = [
    {
      id: 1,
      stayId: 1,
      handledById: 1,
      transactionType: FinancialTransactionType.ROOM_CHARGE,
      amountCentavos: 25_000,
      paymentMethod: PaymentMethod.CASH,
      createdAt: new Date('2026-08-08T01:00:00.000Z'),
      handledBy: { id: 1, username: 'Dodong' },
      stay: { durationHours: 3, room: { number: '1' } },
    },
    {
      id: 2,
      stayId: 2,
      handledById: 2,
      transactionType: FinancialTransactionType.ROOM_CHARGE,
      amountCentavos: 50_000,
      paymentMethod: PaymentMethod.GCASH,
      createdAt: new Date('2026-08-08T02:00:00.000Z'),
      handledBy: { id: 2, username: 'Along' },
      stay: { durationHours: 6, room: { number: '2' } },
    },
    {
      id: 3,
      stayId: 1,
      handledById: 2,
      transactionType: FinancialTransactionType.EXTENSION_CHARGE,
      amountCentavos: 25_000,
      paymentMethod: PaymentMethod.CASH,
      createdAt: new Date('2026-08-08T03:00:00.000Z'),
      handledBy: { id: 2, username: 'Along' },
      stay: { durationHours: 3, room: { number: '1' } },
    },
  ];
  const extensions = [
    {
      id: 1,
      stayId: 1,
      createdById: 2,
      durationHours: 3,
      amountCentavos: 25_000,
      paymentMethod: PaymentMethod.CASH,
      createdAt: new Date('2026-08-08T03:00:00.000Z'),
      createdBy: { id: 2, username: 'Along' },
      stay: { room: { number: '1' } },
    },
  ];
  const auditLogs = [
    {
      id: 1,
      staffId: 1,
      action: 'LOGIN',
      entityType: 'SESSION',
      entityId: null,
      details: null,
      createdAt: new Date('2026-08-08T00:30:00.000Z'),
      staff: { id: 1, username: 'Dodong' },
    },
    {
      id: 2,
      staffId: 2,
      action: 'LOGOUT',
      entityType: 'SESSION',
      entityId: null,
      details: null,
      createdAt: new Date('2026-08-08T04:30:00.000Z'),
      staff: { id: 2, username: 'Along' },
    },
  ];

  return {
    staffAccount: {
      findFirst: vi.fn().mockResolvedValue({
        id: 2,
        username: 'Along',
        role: StaffRole.FRONT_DESK,
      }),
    },
    stay: { findMany: vi.fn().mockResolvedValue(stays) },
    financialTransaction: {
      findMany: vi.fn().mockResolvedValue(transactions),
    },
    stayExtension: { findMany: vi.fn().mockResolvedValue(extensions) },
    auditLog: { findMany: vi.fn().mockResolvedValue(auditLogs) },
    room: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
}

describe('Owner reporting', () => {
  test('uses the 8 AM operational boundary for custom ranges', () => {
    const window = resolveOwnerReportWindow({
      preset: 'custom',
      shift: 'ALL',
      from: '2026-08-07',
      to: '2026-08-08',
      now,
    });

    expect(window.startsAt.toISOString()).toBe('2026-08-07T00:00:00.000Z');
    expect(window.endsAt.toISOString()).toBe('2026-08-09T00:00:00.000Z');
  });

  test('builds overall totals from authoritative records', async () => {
    const report = await buildOwnerReport(database(), {
      preset: 'specific_date',
      shift: 'ALL',
      date: '2026-08-08',
      now,
    });

    expect(report.summary).toMatchObject({
      totalCheckIns: 2,
      completedStays: 1,
      activeStays: 1,
      uniqueRoomsUsed: 2,
      extensionCount: 1,
      overdueCheckoutCount: 1,
    });
    expect(report.financial).toMatchObject({
      grossRoomRevenueCentavos: 75_000,
      extensionRevenueCentavos: 25_000,
      totalCollectedCentavos: 100_000,
    });
    expect(report.packages).toEqual(
      expect.arrayContaining([
        { durationHours: 3, count: 1, revenueCentavos: 25_000 },
        { durationHours: 6, count: 1, revenueCentavos: 50_000 },
      ]),
    );
  });

  test('attributes each event and payment to the employee who handled it', async () => {
    const report = await buildOwnerReport(database(), {
      preset: 'specific_date',
      shift: 'ALL',
      date: '2026-08-08',
      staffId: 2,
      now,
    });

    expect(report.selectedStaff?.username).toBe('Along');
    expect(report.summary.totalCheckIns).toBe(1);
    expect(report.summary.completedStays).toBe(1);
    expect(report.summary.extensionCount).toBe(1);
    expect(report.financial.totalCollectedCentavos).toBe(75_000);
    expect(report.activity).toHaveLength(1);
    expect(report.activity[0]?.staff?.username).toBe('Along');
  });
});
