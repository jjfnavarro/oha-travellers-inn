import {
  Prisma,
  ProductCategory,
  StaffRole,
  type PrismaClient,
} from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireOwner } from '../middleware/auth.js';

const imageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => {
      if (/^\/api\/product-images\/[a-f0-9-]+\.(jpg|png|webp)$/.test(value)) {
        return true;
      }
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    {
      message: 'Choose an uploaded product image or use an HTTP/HTTPS URL.',
    },
  );

const productFields = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.nativeEnum(ProductCategory),
  sellingPriceCentavos: z.number().int().positive().max(100_000_000),
  imageUrl: imageUrlSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

function productSnapshot(product: {
  name: string;
  category: ProductCategory;
  sellingPriceCentavos: number;
  imageUrl: string | null;
  isActive: boolean;
}) {
  return {
    name: product.name,
    category: product.category,
    sellingPriceCentavos: product.sellingPriceCentavos,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
  };
}

export function createProductsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    const includeInactive = request.query.includeInactive === 'true';
    if (includeInactive && request.authUser.role !== StaffRole.OWNER) {
      response.status(403).json({ message: 'Owner access is required.' });
      return;
    }
    const products = await prisma.product.findMany({
      ...(includeInactive ? {} : { where: { isActive: true } }),
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    response.json({ data: products });
  });

  router.post('/', requireOwner, async (request, response) => {
    const body = productFields.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({
        message: body.error.issues.map((issue) => issue.message).join(' '),
      });
      return;
    }
    try {
      const product = await prisma.$transaction(async (transaction) => {
        const created = await transaction.product.create({
          data: {
            ...body.data,
            imageUrl: body.data.imageUrl ?? null,
            isActive: body.data.isActive ?? true,
            createdByUserId: request.authUser.id,
            updatedByUserId: request.authUser.id,
          },
        });
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action: 'CREATE_PRODUCT',
            entityType: 'PRODUCT',
            entityId: String(created.id),
            details: { newValue: productSnapshot(created) },
          },
        });
        return created;
      });
      response.status(201).json({ data: product });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response
          .status(409)
          .json({ message: 'That product name is already in use.' });
        return;
      }
      throw error;
    }
  });

  router.patch('/:id', requireOwner, async (request, response) => {
    const id = z.coerce.number().int().positive().safeParse(request.params.id);
    const body = productFields.partial().safeParse(request.body);
    if (!id.success || !body.success || Object.keys(body.data).length === 0) {
      response.status(400).json({ message: 'Provide a valid product update.' });
      return;
    }
    try {
      const product = await prisma.$transaction(async (transaction) => {
        const previous = await transaction.product.findUnique({
          where: { id: id.data },
        });
        if (!previous) throw new ProductRuleError('Product not found.', 404);
        const data: Prisma.ProductUncheckedUpdateInput = {
          updatedByUserId: request.authUser.id,
          ...(body.data.name !== undefined ? { name: body.data.name } : {}),
          ...(body.data.category !== undefined
            ? { category: body.data.category }
            : {}),
          ...(body.data.sellingPriceCentavos !== undefined
            ? { sellingPriceCentavos: body.data.sellingPriceCentavos }
            : {}),
          ...(body.data.imageUrl !== undefined
            ? { imageUrl: body.data.imageUrl ?? null }
            : {}),
          ...(body.data.isActive !== undefined
            ? { isActive: body.data.isActive }
            : {}),
        };
        const updated = await transaction.product.update({
          where: { id: previous.id },
          data,
        });
        const action =
          previous.isActive && !updated.isActive
            ? 'DEACTIVATE_PRODUCT'
            : 'UPDATE_PRODUCT';
        await transaction.auditLog.create({
          data: {
            staffId: request.authUser.id,
            action,
            entityType: 'PRODUCT',
            entityId: String(updated.id),
            details: {
              previousValue: productSnapshot(previous),
              newValue: productSnapshot(updated),
            },
          },
        });
        return updated;
      });
      response.json({ data: product });
    } catch (error: unknown) {
      if (error instanceof ProductRuleError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response
          .status(409)
          .json({ message: 'That product name is already in use.' });
        return;
      }
      throw error;
    }
  });

  return router;
}

class ProductRuleError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
