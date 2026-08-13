import { PrismaClient } from '@prisma/client';

export const interactiveTransactionOptions = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export const prisma = new PrismaClient({
  transactionOptions: interactiveTransactionOptions,
});

export async function checkDatabaseConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
