import {
  RoomOperationalStatus,
  StaffRole,
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

function session(role: StaffRole) {
  return {
    id: 1,
    expiresAt: new Date(Date.now() + 60_000),
    staff: { id: 1, username: 'User', role, isActive: true },
  };
}

function unusedRoom() {
  return {
    id: 35,
    number: '35',
    roomTypeId: 1,
    displayOrder: 35,
    operationalStatus: RoomOperationalStatus.ACTIVE,
    roomType: { name: 'Standard' },
    _count: { stays: 0, bookings: 0, lostFoundItems: 0 },
  };
}

describe('room lifecycle', () => {
  test('Owner creates a Transient room with an audit record', async () => {
    const created = {
      ...unusedRoom(),
      number: 'Transient 1',
      roomTypeId: 5,
      roomType: { id: 5, name: 'Transient', rates: [] },
      rateOverrides: [],
      stays: [],
    };
    const transaction = {
      room: { create: vi.fn().mockResolvedValue(created) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.OWNER)),
      },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/rooms')
      .set('Cookie', 'oha_session=test')
      .send({
        number: 'Transient 1',
        roomTypeId: 5,
        displayOrder: 35,
        operationalStatus: RoomOperationalStatus.ACTIVE,
      });
    expect(response.status).toBe(201);
    expect(transaction.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ number: 'Transient 1' }),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ROOM_CREATE' }),
    });
  });

  test('Front Desk cannot create room configuration', async () => {
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.FRONT_DESK)),
      },
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .post('/api/rooms')
      .set('Cookie', 'oha_session=test')
      .send({
        number: '35',
        roomTypeId: 5,
        displayOrder: 35,
        operationalStatus: RoomOperationalStatus.ACTIVE,
      });
    expect(response.status).toBe(403);
  });

  test('Owner permanently deletes an unused room and keeps an audit record', async () => {
    const room = unusedRoom();
    const transaction = {
      room: {
        findUnique: vi.fn().mockResolvedValue(room),
        delete: vi.fn().mockResolvedValue(room),
      },
      auditLog: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.OWNER)),
      },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .delete('/api/rooms/35')
      .set('Cookie', 'oha_session=test');
    expect(response.status).toBe(200);
    expect(transaction.room.delete).toHaveBeenCalledWith({ where: { id: 35 } });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ROOM_DELETE', entityId: '35' }),
    });
  });

  test('used room cannot be hard-deleted', async () => {
    const room = { ...unusedRoom(), _count: { stays: 1, bookings: 0 } };
    const transaction = {
      room: { findUnique: vi.fn().mockResolvedValue(room), delete: vi.fn() },
      auditLog: { count: vi.fn().mockResolvedValue(1), create: vi.fn() },
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.OWNER)),
      },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .delete('/api/rooms/35')
      .set('Cookie', 'oha_session=test');
    expect(response.status).toBe(409);
    expect(transaction.room.delete).not.toHaveBeenCalled();
  });

  test('room with Lost & Found history cannot be hard-deleted', async () => {
    const room = {
      ...unusedRoom(),
      _count: { stays: 0, bookings: 0, lostFoundItems: 1 },
    };
    const transaction = {
      room: { findUnique: vi.fn().mockResolvedValue(room), delete: vi.fn() },
      auditLog: { count: vi.fn().mockResolvedValue(0), create: vi.fn() },
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.OWNER)),
      },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .delete('/api/rooms/35')
      .set('Cookie', 'oha_session=test');
    expect(response.status).toBe(409);
    expect(transaction.room.delete).not.toHaveBeenCalled();
  });

  test('Front Desk cannot delete a room', async () => {
    const transaction = { room: { delete: vi.fn() } };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.FRONT_DESK)),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .delete('/api/rooms/35')
      .set('Cookie', 'oha_session=test');
    expect(response.status).toBe(403);
    expect(transaction.room.delete).not.toHaveBeenCalled();
  });

  test('Front Desk cannot restore an archived room', async () => {
    const room = {
      ...unusedRoom(),
      operationalStatus: RoomOperationalStatus.INACTIVE,
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.FRONT_DESK)),
      },
      room: { findUnique: vi.fn().mockResolvedValue(room) },
      stay: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .patch('/api/rooms/35')
      .set('Cookie', 'oha_session=test')
      .send({ operationalStatus: RoomOperationalStatus.ACTIVE });
    expect(response.status).toBe(403);
    expect(prisma.stay.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('Owner can rename and retype a used room without changing its history', async () => {
    const room = { ...unusedRoom(), _count: { stays: 2, bookings: 1 } };
    const updated = {
      ...room,
      number: 'Transient 1',
      roomTypeId: 5,
      roomType: { id: 5, name: 'Transient', rates: [] },
      rateOverrides: [],
      stays: [],
    };
    const transaction = {
      roomType: {
        findUnique: vi.fn().mockResolvedValue({
          rates: [{ durationHours: 12 }, { durationHours: 24 }],
        }),
      },
      roomRateOverride: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      room: { update: vi.fn().mockResolvedValue(updated) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 3 }) },
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.OWNER)),
      },
      room: { findUnique: vi.fn().mockResolvedValue(room) },
      stay: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .patch('/api/rooms/35')
      .set('Cookie', 'oha_session=test')
      .send({ number: 'Transient 1', roomTypeId: 5 });
    expect(response.status).toBe(200);
    expect(prisma.stay.findUnique).not.toHaveBeenCalled();
    expect(transaction.room.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 35 },
        data: expect.objectContaining({
          number: 'Transient 1',
          roomTypeId: 5,
        }),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ROOM_EDIT', entityId: '35' }),
    });
  });

  test('used room can be archived while its history remains untouched', async () => {
    const room = { ...unusedRoom(), _count: { stays: 1, bookings: 1 } };
    const updated = {
      ...room,
      operationalStatus: RoomOperationalStatus.INACTIVE,
      roomType: { id: 1, name: 'Standard', rates: [] },
      rateOverrides: [],
      stays: [],
    };
    const transaction = {
      room: { update: vi.fn().mockResolvedValue(updated) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 2 }) },
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session(StaffRole.OWNER)),
      },
      room: { findUnique: vi.fn().mockResolvedValue(room) },
      stay: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    const response = await request(createApp(environment, vi.fn(), prisma))
      .patch('/api/rooms/35')
      .set('Cookie', 'oha_session=test')
      .send({ operationalStatus: RoomOperationalStatus.INACTIVE });
    expect(response.status).toBe(200);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ROOM_ARCHIVE' }),
    });
  });
});
