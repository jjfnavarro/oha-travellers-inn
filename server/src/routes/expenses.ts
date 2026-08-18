import {
  ExpenseStatus,
  FinancialTransactionType,
  PaymentMethod,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireOwner } from '../middleware/auth.js';
import {
  currentOperationalDate,
  getShiftWindow,
} from '../services/shift-time.js';

const createExpenseSchema = z
  .object({
    amountCentavos: z.number().int().positive().max(2_147_483_647),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

const voidExpenseSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

const listExpenseSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  staffId: z.coerce.number().int().positive().optional(),
  shiftId: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
});

const expenseInclude = {
  recordedBy: { select: { id: true, username: true } },
  voidedBy: { select: { id: true, username: true } },
  shift: { select: { id: true, type: true, startsAt: true, endsAt: true } },
};

class ExpenseRuleError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export function createExpensesRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.post('/', async (request, response) => {
    const body = createExpenseSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({
        message:
          'Enter a positive expense amount and a reason. Expenses are always Cash.',
      });
      return;
    }
    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.expense.findUnique({
            where: { idempotencyKey: body.data.idempotencyKey },
            include: expenseInclude,
          });
          if (existing) {
            if (
              existing.amountCentavos !== body.data.amountCentavos ||
              existing.reason !== body.data.reason ||
              existing.recordedById !== request.authUser.id
            ) {
              throw new ExpenseRuleError(
                'This expense submission key was already used.',
                409,
              );
            }
            return { expense: existing, created: false };
          }
          const createdAt = new Date();
          const shiftWindow = getShiftWindow(createdAt);
          const shift = await transaction.shift.upsert({
            where: { startsAt: shiftWindow.startsAt },
            update: { type: shiftWindow.type, endsAt: shiftWindow.endsAt },
            create: shiftWindow,
          });
          const expense = await transaction.expense.create({
            data: {
              amountCentavos: body.data.amountCentavos,
              reason: body.data.reason,
              idempotencyKey: body.data.idempotencyKey,
              businessDate: new Date(
                `${currentOperationalDate(createdAt)}T00:00:00.000Z`,
              ),
              shiftId: shift.id,
              recordedById: request.authUser.id,
              createdAt,
            },
            include: expenseInclude,
          });
          await transaction.financialTransaction.create({
            data: {
              expenseId: expense.id,
              handledById: request.authUser.id,
              transactionType: FinancialTransactionType.EXPENSE,
              amountCentavos: expense.amountCentavos,
              paymentMethod: PaymentMethod.CASH,
              note: expense.reason,
              createdAt,
            },
          });
          await transaction.auditLog.create({
            data: {
              staffId: request.authUser.id,
              action: 'EXPENSE_CREATE',
              entityType: 'EXPENSE',
              entityId: String(expense.id),
              details: {
                amountCentavos: expense.amountCentavos,
                reason: expense.reason,
                paymentMethod: PaymentMethod.CASH,
                shiftId: expense.shiftId,
                businessDate: currentOperationalDate(createdAt),
              },
              createdAt,
            },
          });
          return { expense, created: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      response
        .status(result.created ? 201 : 200)
        .json({ data: result.expense });
    } catch (error: unknown) {
      if (error instanceof ExpenseRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        response.status(409).json({
          message: 'The expense was already submitted. Refresh and review it.',
        });
        return;
      }
      throw error;
    }
  });

  router.get('/', requireOwner, async (request, response) => {
    const query = listExpenseSchema.safeParse(request.query);
    if (!query.success) {
      response
        .status(400)
        .json({ message: 'The expense filters are invalid.' });
      return;
    }
    const expenses = await prisma.expense.findMany({
      where: {
        ...(query.data.from || query.data.to
          ? {
              createdAt: {
                ...(query.data.from ? { gte: query.data.from } : {}),
                ...(query.data.to ? { lt: query.data.to } : {}),
              },
            }
          : {}),
        ...(query.data.staffId ? { recordedById: query.data.staffId } : {}),
        ...(query.data.shiftId ? { shiftId: query.data.shiftId } : {}),
        ...(query.data.status ? { status: query.data.status } : {}),
      },
      include: expenseInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    response.json({ data: expenses });
  });

  router.post('/:id/void', requireOwner, async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = voidExpenseSchema.safeParse(request.body);
    if (!id.success || !body.success) {
      response.status(400).json({ message: 'Provide a reason for the void.' });
      return;
    }
    try {
      const expense = await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.expense.findUnique({
            where: { id: id.data },
          });
          if (!existing) throw new ExpenseRuleError('Expense not found.', 404);
          if (existing.status === ExpenseStatus.VOIDED) {
            throw new ExpenseRuleError('This expense is already voided.', 409);
          }
          const voidedAt = new Date();
          const updated = await transaction.expense.update({
            where: { id: existing.id },
            data: {
              status: ExpenseStatus.VOIDED,
              voidedById: request.authUser.id,
              voidReason: body.data.reason,
              voidedAt,
            },
            include: expenseInclude,
          });
          await transaction.financialTransaction.create({
            data: {
              expenseId: existing.id,
              handledById: request.authUser.id,
              transactionType: FinancialTransactionType.EXPENSE_REVERSAL,
              amountCentavos: existing.amountCentavos,
              paymentMethod: PaymentMethod.CASH,
              note: body.data.reason,
              createdAt: voidedAt,
            },
          });
          await transaction.auditLog.create({
            data: {
              staffId: request.authUser.id,
              action: 'EXPENSE_VOID',
              entityType: 'EXPENSE',
              entityId: String(existing.id),
              details: {
                amountCentavos: existing.amountCentavos,
                originalReason: existing.reason,
                voidReason: body.data.reason,
              },
              createdAt: voidedAt,
            },
          });
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      response.json({ data: expense });
    } catch (error: unknown) {
      if (error instanceof ExpenseRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  return router;
}
