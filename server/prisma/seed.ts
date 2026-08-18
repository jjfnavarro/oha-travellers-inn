import 'dotenv/config';
import { PrismaClient, RoomOperationalStatus } from '@prisma/client';

const prisma = new PrismaClient();

const roomTypes = [
  {
    name: 'Standard',
    description: 'Standard guest room',
    rates: [
      { durationHours: 3, amountCentavos: 25_000 },
      { durationHours: 6, amountCentavos: 50_000 },
      { durationHours: 12, amountCentavos: 80_000 },
      { durationHours: 24, amountCentavos: 100_000 },
    ],
    rooms: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'A', 'B', 'C'],
  },
  {
    name: 'Deluxe',
    description: 'Deluxe guest room',
    rates: [
      { durationHours: 3, amountCentavos: 30_000 },
      { durationHours: 6, amountCentavos: 60_000 },
      { durationHours: 12, amountCentavos: 80_000 },
      { durationHours: 24, amountCentavos: 110_000 },
    ],
    rooms: ['20', '21', '22', '23', '24', '25', '26', '27'],
  },
  {
    name: 'Suite',
    description: 'Suite guest room',
    rates: [
      { durationHours: 3, amountCentavos: 45_000 },
      { durationHours: 6, amountCentavos: 90_000 },
      { durationHours: 24, amountCentavos: 125_000 },
    ],
    rooms: ['28', '29', '30', '31', '32', '33'],
  },
  {
    name: 'Family',
    description: 'Family room available for 12-hour and longer stays',
    rates: [
      { durationHours: 12, amountCentavos: 180_000 },
      { durationHours: 24, amountCentavos: 125_000 },
    ],
    rooms: ['34'],
  },
  {
    name: 'Transient',
    description: 'Transient room available for 12-hour and longer stays',
    rates: [
      { durationHours: 12, amountCentavos: 180_000 },
      { durationHours: 24, amountCentavos: 250_000 },
    ],
    rooms: [],
  },
] as const;

async function seed(): Promise<void> {
  let displayOrder = 1;

  for (const roomTypeData of roomTypes) {
    const roomType = await prisma.roomType.upsert({
      where: { name: roomTypeData.name },
      update: { description: roomTypeData.description },
      create: {
        name: roomTypeData.name,
        description: roomTypeData.description,
      },
    });

    for (const rate of roomTypeData.rates) {
      await prisma.stayRate.upsert({
        where: {
          roomTypeId_durationHours: {
            roomTypeId: roomType.id,
            durationHours: rate.durationHours,
          },
        },
        update: {},
        create: { roomTypeId: roomType.id, ...rate },
      });
    }

    for (const number of roomTypeData.rooms) {
      const room = await prisma.room.upsert({
        where: { number },
        update: { roomTypeId: roomType.id, displayOrder },
        create: {
          number,
          displayOrder,
          roomTypeId: roomType.id,
          operationalStatus: RoomOperationalStatus.ACTIVE,
        },
      });
      const standardThreeHourOverride = ['7', '8', 'A', 'B', 'C'].includes(
        number,
      )
        ? 30_000
        : ['9', '10'].includes(number)
          ? 35_000
          : null;
      if (standardThreeHourOverride) {
        await prisma.roomRateOverride.upsert({
          where: {
            roomId_durationHours: { roomId: room.id, durationHours: 3 },
          },
          update: { amountCentavos: standardThreeHourOverride },
          create: {
            roomId: room.id,
            durationHours: 3,
            amountCentavos: standardThreeHourOverride,
          },
        });
      }
      displayOrder += 1;
    }
  }
}

seed()
  .then(() => console.log('Seeded 5 room types, their rates, and 28 rooms.'))
  .catch((error: unknown) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
