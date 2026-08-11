import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Router, raw } from 'express';
import type { Environment } from '../config/env.js';
import { requireOwner } from '../middleware/auth.js';

const supportedImages = {
  'image/jpeg': {
    extension: 'jpg',
    matches: (data: Buffer) => data[0] === 0xff && data[1] === 0xd8,
  },
  'image/png': {
    extension: 'png',
    matches: (data: Buffer) =>
      data
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    extension: 'webp',
    matches: (data: Buffer) =>
      data.subarray(0, 4).toString('ascii') === 'RIFF' &&
      data.subarray(8, 12).toString('ascii') === 'WEBP',
  },
} as const;

export function productImageDirectory(environment: Environment): string {
  return resolve(environment.PRODUCT_IMAGE_DIR ?? 'uploads/products');
}

export function createProductImagesRouter(environment: Environment): Router {
  const router = Router();

  router.post(
    '/upload',
    requireOwner,
    raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
    async (request, response) => {
      const imageType =
        supportedImages[
          request
            .get('content-type')
            ?.split(';')[0]
            ?.trim() as keyof typeof supportedImages
        ];
      const data = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.alloc(0);
      if (!imageType || data.length === 0 || !imageType.matches(data)) {
        response.status(400).json({
          message: 'Choose a valid JPEG, PNG, or WebP image up to 5 MB.',
        });
        return;
      }

      const directory = productImageDirectory(environment);
      await mkdir(directory, { recursive: true });
      const filename = `${randomUUID()}.${imageType.extension}`;
      await writeFile(resolve(directory, filename), data, { flag: 'wx' });
      response.status(201).json({
        data: { imageUrl: `/api/product-images/${filename}` },
      });
    },
  );

  return router;
}
