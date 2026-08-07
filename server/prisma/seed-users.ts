import 'dotenv/config';
import { PrismaClient, StaffRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';

const passwords = z
  .object({
    OWNER_INITIAL_PASSWORD: z.string().min(8),
    DAY_STAFF_INITIAL_PASSWORD: z.string().min(8),
    NIGHT_STAFF_INITIAL_PASSWORD: z.string().min(8),
  })
  .safeParse(process.env);

if (!passwords.success) {
  throw new Error(
    'Set all three initial password variables in server/.env. Each password must contain at least 8 characters.',
  );
}

const prisma = new PrismaClient();
const accounts = [
  {
    username: 'Zack',
    password: passwords.data.OWNER_INITIAL_PASSWORD,
    role: StaffRole.OWNER,
  },
  {
    username: 'Dodong',
    password: passwords.data.DAY_STAFF_INITIAL_PASSWORD,
    role: StaffRole.FRONT_DESK,
  },
  {
    username: 'Along',
    password: passwords.data.NIGHT_STAFF_INITIAL_PASSWORD,
    role: StaffRole.FRONT_DESK,
  },
];

async function seedUsers(): Promise<void> {
  for (const account of accounts) {
    const passwordHash = await hash(account.password, 12);
    await prisma.staffAccount.upsert({
      where: { username: account.username },
      update: { passwordHash, role: account.role, isActive: true },
      create: { username: account.username, passwordHash, role: account.role },
    });
  }
  console.log('Created or updated Zack, Dodong, and Along.');
}

seedUsers()
  .catch((error: unknown) => {
    console.error('Staff account setup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
