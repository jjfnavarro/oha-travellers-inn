import {
  LostFoundStatus,
  RoomOperationalStatus,
  StaffRole,
  StayStatus,
  type PrismaClient,
} from '@prisma/client';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';
import { createApp } from '../app.js';
import type { Environment } from '../config/env.js';

const environment: Environment = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: 'mysql://user:password@localhost:3306/test',
  SHADOW_DATABASE_URL: 'mysql://user:password@localhost:3306/test_shadow',
  CLIENT_URL: 'http://localhost:5173',
  BUSINESS_TIMEZONE: 'Asia/Manila',
};

function setup(role: StaffRole = StaffRole.FRONT_DESK) {
  const staff = {
    id: role === StaffRole.OWNER ? 1 : 2,
    username: role === StaffRole.OWNER ? 'Zack' : 'Dodong',
    role,
  };
  const item = {
    id: 9,
    itemName: 'Black Charger',
    description: 'USB-C charger found beside the bed',
    roomId: 5,
    room: {
      id: 5,
      number: '5',
      operationalStatus: RoomOperationalStatus.CLEANING,
    },
    stayId: 20,
    stay: {
      id: 20,
      guestName: 'Test Guest',
      status: StayStatus.COMPLETED,
      checkedInAt: new Date('2026-08-22T02:00:00.000Z'),
      checkedOutAt: new Date('2026-08-23T02:00:00.000Z'),
    },
    foundAt: new Date('2026-08-23T02:15:00.000Z'),
    recordedById: staff.id,
    recordedBy: staff,
    status: LostFoundStatus.UNCLAIMED,
    notes: 'Held at front desk',
    claimedAt: null,
    claimedByName: null,
    claimNotes: null,
    claimProcessedBy: null,
    disposedAt: null,
    disposalNotes: null,
    disposedBy: null,
    createdAt: new Date('2026-08-23T02:16:00.000Z'),
    updatedAt: new Date('2026-08-23T02:16:00.000Z'),
  };
  const transaction = {
    room: { findUnique: vi.fn().mockResolvedValue({ id: 5 }) },
    stay: {
      findFirst: vi.fn().mockResolvedValue({ id: 20 }),
      findMany: vi.fn().mockResolvedValue([item.stay]),
    },
    lostFoundItem: {
      create: vi.fn().mockResolvedValue(item),
      findUnique: vi.fn().mockResolvedValue(item),
      findMany: vi.fn().mockResolvedValue([item]),
      update: vi.fn().mockResolvedValue(item),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(item),
      delete: vi.fn().mockResolvedValue(item),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 30 }) },
  };
  const prisma = {
    session: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        expiresAt: new Date(Date.now() + 60_000),
        staff: { ...staff, isActive: true },
      }),
    },
    room: transaction.room,
    stay: transaction.stay,
    lostFoundItem: transaction.lostFoundItem,
    $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
      callback(transaction),
    ),
  } as unknown as PrismaClient;
  return { prisma, transaction, item };
}

const validBody = {
  itemName: 'Black Charger',
  description: 'USB-C charger found beside the bed',
  roomId: 5,
  stayId: 20,
  foundAt: new Date(Date.now() - 60_000).toISOString(),
  notes: 'Held at front desk',
};

describe('Lost & Found routes', () => {
  test('requires an authenticated account', async () => {
    const { prisma } = setup();
    const response = await request(createApp(environment, vi.fn(), prisma)).get(
      '/api/lost-found',
    );
    expect(response.status).toBe(401);
  });

  test.each([StaffRole.FRONT_DESK, StaffRole.OWNER])(
    '%s can create an attributed item without a financial write',
    async (role) => {
      const { prisma, transaction } = setup(role);
      const response = await request(createApp(environment, vi.fn(), prisma))
        .post('/api/lost-found')
        .set('Cookie', 'oha_session=test')
        .send(validBody);
      expect(response.status).toBe(201);
      expect(transaction.lostFoundItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            roomId: 5,
            stayId: 20,
            recordedById: role === StaffRole.OWNER ? 1 : 2,
          }),
        }),
      );
      expect(transaction.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'LOST_FOUND_CREATE' }),
      });
      expect('financialTransaction' in transaction).toBe(false);
    },
  );

  test('requires an item name and room', async () => {
    const { prisma, transaction } = setup();
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/lost-found')
      .set('Cookie', 'oha_session=test')
      .send({ foundAt: validBody.foundAt });
    expect(response.status).toBe(400);
    expect(transaction.lostFoundItem.create).not.toHaveBeenCalled();
  });

  test('rejects an unknown room and a mismatched stay', async () => {
    const first = setup();
    first.transaction.room.findUnique.mockResolvedValueOnce(null);
    const missingRoom = await request(
      createApp(environment, vi.fn(), first.prisma),
    )
      .post('/api/lost-found')
      .set('Cookie', 'oha_session=test')
      .send(validBody);
    expect(missingRoom.status).toBe(404);

    const second = setup();
    second.transaction.stay.findFirst.mockResolvedValueOnce(null);
    const mismatchedStay = await request(
      createApp(environment, vi.fn(), second.prisma),
    )
      .post('/api/lost-found')
      .set('Cookie', 'oha_session=test')
      .send(validBody);
    expect(mismatchedStay.status).toBe(400);
  });

  test('searches item text, Room 5, status, room, and found date', async () => {
    const { prisma, transaction } = setup();
    const response = await request(createApp(environment, vi.fn(), prisma))
      .get(
        '/api/lost-found?q=Room%205&status=UNCLAIMED&roomId=5&from=2026-08-23T00:00:00.000Z&to=2026-08-24T00:00:00.000Z',
      )
      .set('Cookie', 'oha_session=test');
    expect(response.status).toBe(200);
    expect(transaction.lostFoundItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: LostFoundStatus.UNCLAIMED,
          roomId: 5,
          foundAt: expect.objectContaining({
            gte: new Date('2026-08-23T00:00:00.000Z'),
            lte: new Date('2026-08-24T00:00:00.000Z'),
          }),
          OR: expect.arrayContaining([
            { itemName: { contains: 'Room 5' } },
            { room: { number: { equals: '5' } } },
          ]),
        }),
      }),
    );
  });

  test('returns recent completed stays for a room without guessing a link', async () => {
    const { prisma, transaction } = setup();
    const response = await request(createApp(environment, vi.fn(), prisma))
      .get('/api/lost-found/eligible-stays?roomId=5')
      .set('Cookie', 'oha_session=test');
    expect(response.status).toBe(200);
    expect(transaction.stay.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roomId: 5, status: StayStatus.COMPLETED },
        take: 10,
      }),
    );
  });

  test('Staff can claim an unclaimed item once with attribution and audit', async () => {
    const { prisma, transaction, item } = setup();
    transaction.lostFoundItem.findUniqueOrThrow.mockResolvedValue({
      ...item,
      status: LostFoundStatus.CLAIMED,
      claimedByName: 'Test Guest',
      claimNotes: 'Guest described the item',
    });
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/lost-found/9/claim')
      .set('Cookie', 'oha_session=test')
      .send({ claimedByName: 'Test Guest', notes: 'Guest described the item' });
    expect(response.status).toBe(200);
    expect(transaction.lostFoundItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9, status: LostFoundStatus.UNCLAIMED },
        data: expect.objectContaining({
          status: LostFoundStatus.CLAIMED,
          claimProcessedById: 2,
        }),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'LOST_FOUND_CLAIM' }),
    });
  });

  test('Staff can correct basic information while an item is unclaimed', async () => {
    const { prisma, transaction, item } = setup();
    transaction.lostFoundItem.update.mockResolvedValue({
      ...item,
      itemName: 'USB-C Charger',
    });
    const response = await request(createApp(environment, vi.fn(), prisma))
      .patch('/api/lost-found/9')
      .set('Cookie', 'oha_session=test')
      .send({ itemName: 'USB-C Charger', notes: 'Corrected description' });
    expect(response.status).toBe(200);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'LOST_FOUND_EDIT' }),
    });
  });

  test('rejects a repeated claim after the item has already progressed', async () => {
    const { prisma, transaction } = setup();
    transaction.lostFoundItem.updateMany.mockResolvedValueOnce({ count: 0 });
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/lost-found/9/claim')
      .set('Cookie', 'oha_session=test')
      .send({ claimedByName: 'Test Guest' });
    expect(response.status).toBe(409);
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  test('Front Desk cannot dispose or delete an item', async () => {
    const { prisma, transaction } = setup();
    const dispose = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/lost-found/9/dispose')
      .set('Cookie', 'oha_session=test')
      .send({ notes: 'Owner approved disposal' });
    const deletion = await request(createApp(environment, vi.fn(), prisma))
      .delete('/api/lost-found/9')
      .set('Cookie', 'oha_session=test')
      .send({ reason: 'Duplicate' });
    expect(dispose.status).toBe(403);
    expect(deletion.status).toBe(403);
    expect(transaction.lostFoundItem.updateMany).not.toHaveBeenCalled();
    expect(transaction.lostFoundItem.delete).not.toHaveBeenCalled();
  });

  test('Owner can dispose an unclaimed item manually with an audit record', async () => {
    const { prisma, transaction, item } = setup(StaffRole.OWNER);
    transaction.lostFoundItem.findUniqueOrThrow.mockResolvedValue({
      ...item,
      status: LostFoundStatus.DISPOSED,
      disposalNotes: 'Owner approved disposal',
    });
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/lost-found/9/dispose')
      .set('Cookie', 'oha_session=test')
      .send({ notes: 'Owner approved disposal' });
    expect(response.status).toBe(200);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'LOST_FOUND_DISPOSE' }),
    });
  });

  test('Owner deletes only an unclaimed duplicate and preserves an audit snapshot', async () => {
    const { prisma, transaction } = setup(StaffRole.OWNER);
    const response = await request(createApp(environment, vi.fn(), prisma))
      .delete('/api/lost-found/9')
      .set('Cookie', 'oha_session=test')
      .send({ reason: 'Duplicate entry' });
    expect(response.status).toBe(200);
    expect(transaction.lostFoundItem.delete).toHaveBeenCalledWith({
      where: { id: 9 },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'LOST_FOUND_DELETE',
        details: expect.objectContaining({ reason: 'Duplicate entry' }),
      }),
    });
  });

  test('archived-room items remain visible', async () => {
    const { prisma, transaction, item } = setup();
    transaction.lostFoundItem.findMany.mockResolvedValue([
      {
        ...item,
        room: {
          ...item.room,
          operationalStatus: RoomOperationalStatus.INACTIVE,
        },
      },
    ]);
    const response = await request(createApp(environment, vi.fn(), prisma))
      .get('/api/lost-found?status=UNCLAIMED')
      .set('Cookie', 'oha_session=test');
    expect(response.status).toBe(200);
    expect(response.body.data[0].room.operationalStatus).toBe('INACTIVE');
  });
});
