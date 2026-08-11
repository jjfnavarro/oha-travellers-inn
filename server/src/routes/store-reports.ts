import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import writeXlsxFile, { type SheetData } from 'write-excel-file/node';
import { z } from 'zod';
import {
  buildStoreReport,
  type StoreReport,
} from '../services/store-report.js';
import { drawRevenueCharts } from './report-pdf-charts.js';

const querySchema = z.object({
  preset: z
    .enum([
      'current_shift',
      'previous_shift',
      'today',
      'specific_date',
      'week',
      'month',
      'custom',
    ])
    .default('today'),
  shift: z.enum(['ALL', 'DAY', 'NIGHT']).default('ALL'),
  paymentMethod: z.enum(['CASH', 'GCASH']).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  staffId: z.coerce.number().int().positive().optional(),
});

function options(query: unknown) {
  const result = querySchema.safeParse(query);
  if (!result.success)
    throw new Error('One or more report filters are invalid.');
  return result.data;
}

const money = (centavos: number) =>
  `PHP ${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

async function pdf(report: StoreReport): Promise<Buffer> {
  const document = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.fontSize(18).text("OHA Traveller's Inn", { align: 'center' });
  document
    .fontSize(13)
    .text('Mini Store Report', { align: 'center' })
    .moveDown();
  document.fontSize(10).text(`Period: ${report.filters.label}`);
  document.text(`Shift: ${report.filters.shift}`);
  document.text(`Payment: ${report.filters.paymentMethod}`);
  document
    .text(`Staff: ${report.selectedStaff?.username ?? 'All staff'}`)
    .moveDown();
  document.text(`Store revenue: ${money(report.summary.storeRevenueCentavos)}`);
  document.text(
    `Extra charges: ${money(report.summary.extraChargesRevenueCentavos)}`,
  );
  document.text(`Combined: ${money(report.summary.totalRevenueCentavos)}`);
  document.text(`Items sold: ${report.summary.itemsSold}`).moveDown();
  drawRevenueCharts(document, report.revenueTrend, [
    {
      label: 'Store',
      amountCentavos: report.summary.storeRevenueCentavos,
      color: '#18823b',
    },
    {
      label: 'Extras',
      amountCentavos: report.summary.extraChargesRevenueCentavos,
      color: '#a05a2c',
    },
  ]);
  document.moveDown();
  document.fontSize(11).text('Product breakdown', { underline: true });
  for (const item of report.products) {
    if (document.y > 760) document.addPage();
    document
      .fontSize(9)
      .text(
        `${item.name}: ${item.quantity} items - ${money(item.revenueCentavos)}`,
      );
  }
  document.end();
  return finished;
}

async function workbook(report: StoreReport): Promise<Buffer> {
  const header = (value: string) => ({
    value,
    fontWeight: 'bold' as const,
    backgroundColor: '#E5E5E5',
  });
  const data: SheetData = [
    [
      {
        value: "OHA Traveller's Inn Mini Store Report",
        fontWeight: 'bold',
        fontSize: 16,
      },
    ],
    [{ value: 'Period' }, { value: report.filters.label }],
    [{ value: 'Shift' }, { value: report.filters.shift }],
    [{ value: 'Payment' }, { value: report.filters.paymentMethod }],
    [
      { value: 'Staff' },
      { value: report.selectedStaff?.username ?? 'All staff' },
    ],
    [],
    [header('Revenue summary'), header('PHP')],
    [
      { value: 'Store products' },
      {
        value: report.summary.storeRevenueCentavos / 100,
        format: 'â‚±#,##0.00',
      },
    ],
    [
      { value: 'Extra charges' },
      {
        value: report.summary.extraChargesRevenueCentavos / 100,
        format: 'â‚±#,##0.00',
      },
    ],
    [
      { value: 'Combined' },
      {
        value: report.summary.totalRevenueCentavos / 100,
        format: 'â‚±#,##0.00',
      },
    ],
    [],
    [
      header('Trend period'),
      header('Total revenue'),
      header('Store products'),
      header('Extra charges'),
    ],
    ...report.revenueTrend.map((point) => [
      { value: point.label },
      { value: point.totalRevenueCentavos / 100, format: '₱#,##0.00' },
      { value: point.storeRevenueCentavos / 100, format: '₱#,##0.00' },
      { value: point.extraChargesRevenueCentavos / 100, format: '₱#,##0.00' },
    ]),
    [],
    [
      header('Product'),
      header('Category'),
      header('Quantity'),
      header('Sales'),
      header('Revenue'),
    ],
    ...report.products.map((item) => [
      { value: item.name },
      { value: item.category.replaceAll('_', ' ') },
      { value: item.quantity },
      { value: item.salesCount },
      { value: item.revenueCentavos / 100, format: 'â‚±#,##0.00' },
    ]),
  ];
  return writeXlsxFile(data, {
    columns: [28, 20, 14, 14, 18].map((width) => ({ width })),
  }).toBuffer();
}

export function createStoreReportsRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.get('/', async (request, response) => {
    try {
      response.json({
        data: await buildStoreReport(prisma, options(request.query)),
      });
    } catch (error: unknown) {
      response.status(400).json({
        message:
          error instanceof Error ? error.message : 'The report is invalid.',
      });
    }
  });
  router.get('/pdf', async (request, response) => {
    try {
      const report = await buildStoreReport(prisma, options(request.query));
      response.type('application/pdf');
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="oha-mini-store-report.pdf"',
      );
      response.send(await pdf(report));
    } catch (error: unknown) {
      response.status(400).json({
        message:
          error instanceof Error ? error.message : 'The report is invalid.',
      });
    }
  });
  router.get('/xlsx', async (request, response) => {
    try {
      const report = await buildStoreReport(prisma, options(request.query));
      response.type(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="oha-mini-store-report.xlsx"',
      );
      response.send(await workbook(report));
    } catch (error: unknown) {
      response.status(400).json({
        message:
          error instanceof Error ? error.message : 'The report is invalid.',
      });
    }
  });
  return router;
}
