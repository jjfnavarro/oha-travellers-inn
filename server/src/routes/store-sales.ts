import {
  FinancialTransactionType,
  PaymentMethod,
  Prisma,
  ProductCategory,
  StayStatus,
  type PrismaClient,
} from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

const purchaseSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100),
  paymentMethod: z.enum([PaymentMethod.CASH, PaymentMethod.GCASH]),
  stayId: z.number().int().positive().optional().nullable(),
  idempotencyKey: z.string().uuid(),
});

const saleInclude = {
  items: true,
  handledBy: { select: { id: true, username: true } },
  stay: { select: { id: true, room: { select: { number: true } } } },
  financialTransactions: true,
} as const;

export function createStoreSalesRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.post('/', async (request, response) => {
    const body = purchaseSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({
        message: body.error.issues.map((issue) => issue.message).join(' '),
      });
      return;
    }

    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.storeSale.findUnique({
            where: { idempotencyKey: body.data.idempotencyKey },
            include: saleInclude,
          });
          if (existing) {
            assertMatchingRetry(existing, body.data, request.authUser.id);
            return { sale: existing, repeated: true };
          }

          const product = await transaction.product.findUnique({
            where: { id: body.data.productId },
          });
          if (!product || !product.isActive) {
            throw new StoreSaleRuleError(
              'This product is inactive or no longer available.',
              409,
            );
          }

          if (
            product.category === ProductCategory.EXTRA_CHARGE &&
            !body.data.stayId
          ) {
            throw new StoreSaleRuleError(
              'Select an occupied room for this extra charge.',
              400,
            );
          }

          if (body.data.stayId) {
            const stay = await transaction.stay.findFirst({
              where: {
                id: body.data.stayId,
                status: StayStatus.ACTIVE,
                activeRoomId: { not: null },
              },
              select: { id: true },
            });
            if (!stay) {
              throw new StoreSaleRuleError(
                'The selected room no longer has an active stay.',
                409,
              );
            }
          }

          const totalAmountCentavos =
            product.sellingPriceCentavos * body.data.quantity;
          const createdAt = new Date();
          const sale = await transaction.storeSale.create({
            data: {
              handledByUserId: request.authUser.id,
              stayId: body.data.stayId ?? null,
              paymentMethod: body.data.paymentMethod,
              totalAmountCentavos,
              idempotencyKey: body.data.idempotencyKey,
              createdAt,
              items: {
                create: {
                  productId: product.id,
                  productNameSnapshot: product.name,
                  categorySnapshot: product.category,
                  unitPriceCentavos: product.sellingPriceCentavos,
                  quantity: body.data.quantity,
                  lineTotalCentavos: totalAmountCentavos,
                  createdAt,
                },
              },
            },
          });
          await transaction.financialTransaction.create({
            data: {
              storeSaleId: sale.id,
              handledById: request.authUser.id,
              transactionType:
                product.category === ProductCategory.STORE_PRODUCT
                  ? FinancialTransactionType.STORE_SALE
                  : FinancialTransactionType.EXTRA_CHARGE,
              amountCentavos: totalAmountCentavos,
              paymentMethod: body.data.paymentMethod,
              note: `${product.name} x ${body.data.quantity}`,
              createdAt,
            },
          });
          await transaction.auditLog.create({
            data: {
              staffId: request.authUser.id,
              action: 'STORE_PURCHASE',
              entityType: 'STORE_SALE',
              entityId: String(sale.id),
              details: {
                productId: product.id,
                productName: product.name,
                category: product.category,
                quantity: body.data.quantity,
                unitPriceCentavos: product.sellingPriceCentavos,
                amountCentavos: totalAmountCentavos,
                paymentMethod: body.data.paymentMethod,
                stayId: body.data.stayId ?? null,
              },
              createdAt,
            },
          });
          const completeSale = await transaction.storeSale.findUniqueOrThrow({
            where: { id: sale.id },
            include: saleInclude,
          });
          return { sale: completeSale, repeated: false };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      response.status(result.repeated ? 200 : 201).json({
        data: result.sale,
        repeated: result.repeated,
      });
    } catch (error: unknown) {
      if (error instanceof StoreSaleRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await prisma.storeSale.findUnique({
          where: { idempotencyKey: body.data.idempotencyKey },
          include: saleInclude,
        });
        if (existing) {
          try {
            assertMatchingRetry(existing, body.data, request.authUser.id);
            response.json({ data: existing, repeated: true });
            return;
          } catch (retryError: unknown) {
            if (retryError instanceof StoreSaleRuleError) {
              response
                .status(retryError.statusCode)
                .json({ message: retryError.message });
              return;
            }
          }
        }
      }
      throw error;
    }
  });

  return router;
}

function assertMatchingRetry(
  sale: Prisma.StoreSaleGetPayload<{ include: typeof saleInclude }>,
  request: z.infer<typeof purchaseSchema>,
  handledByUserId: number,
): void {
  const item = sale.items[0];
  if (
    sale.handledByUserId !== handledByUserId ||
    sale.paymentMethod !== request.paymentMethod ||
    sale.stayId !== (request.stayId ?? null) ||
    item?.productId !== request.productId ||
    item.quantity !== request.quantity
  ) {
    throw new StoreSaleRuleError(
      'That purchase request key was already used for different details.',
      409,
    );
  }
}

class StoreSaleRuleError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
