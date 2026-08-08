import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import writeXlsxFile, { type SheetData } from 'write-excel-file/node';
import { z } from 'zod';
import {
  buildOwnerReport,
  type OwnerReport,
  type OwnerReportOptions,
} from '../services/owner-report.js';

function money(centavos: number): string {
  return `PHP ${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

const ownerReportQuerySchema = z.object({
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

function ownerReportOptions(query: unknown): OwnerReportOptions {
  const result = ownerReportQuerySchema.safeParse(query);
  if (!result.success) {
    throw new Error('One or more report filters are invalid.');
  }
  return result.data;
}

function ownerReportFilename(report: OwnerReport, extension: string): string {
  const start = report.filters.startsAt.toISOString().slice(0, 10);
  const suffix = report.selectedStaff
    ? `-${report.selectedStaff.username.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
    : '';
  return `oha-owner-report-${start}${suffix}.${extension}`;
}

async function createOwnerPdf(report: OwnerReport): Promise<Buffer> {
  const document = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  const addPageWhenNeeded = (height = 70) => {
    if (document.y + height > 780) document.addPage();
  };

  document.fontSize(18).text("OHA Traveller's Inn", { align: 'center' });
  document.fontSize(13).text('Owner Report', { align: 'center' });
  document.moveDown();
  document.fontSize(10).text(`Period: ${report.filters.label}`);
  document.text(`Shift: ${report.filters.shift}`);
  document.text(
    `View: ${report.selectedStaff ? `Staff - ${report.selectedStaff.username}` : 'Overall motel'}`,
  );
  document.moveDown();
  document
    .fontSize(11)
    .text('Operational summary', { underline: true })
    .fontSize(10)
    .text(`Check-ins: ${report.summary.totalCheckIns}`)
    .text(`Completed stays: ${report.summary.completedStays}`)
    .text(`Active stays created: ${report.summary.activeStays}`)
    .text(`Unique rooms used: ${report.summary.uniqueRoomsUsed}`)
    .text(`Extensions: ${report.summary.extensionCount}`)
    .text(`Overdue checkouts: ${report.summary.overdueCheckoutCount}`);
  document.moveDown();
  document
    .fontSize(11)
    .text('Financial summary', { underline: true })
    .fontSize(10)
    .text(`Room charges: ${money(report.financial.grossRoomRevenueCentavos)}`)
    .text(
      `Extension charges: ${money(report.financial.extensionRevenueCentavos)}`,
    )
    .text(`Gross revenue: ${money(report.financial.grossRevenueCentavos)}`)
    .text(`Net revenue: ${money(report.financial.netRevenueCentavos)}`)
    .text(`Total collected: ${money(report.financial.totalCollectedCentavos)}`);
  document.moveDown();
  document.fontSize(11).text('Package breakdown', { underline: true });
  for (const item of report.packages) {
    document
      .fontSize(9)
      .text(
        `${item.durationHours} hours: ${item.count} check-ins - ${money(item.revenueCentavos)}`,
      );
  }
  document.moveDown();
  document.fontSize(11).text('Room usage', { underline: true });
  for (const item of report.roomUsage) {
    addPageWhenNeeded(20);
    document
      .fontSize(9)
      .text(`Room ${item.roomNumber} (${item.roomType}): ${item.uses} uses`);
  }
  document.moveDown();
  document.fontSize(11).text('Vehicle types', { underline: true });
  for (const item of report.vehicleTypes) {
    document
      .fontSize(9)
      .text(`${item.type.replaceAll('_', ' ')}: ${item.count}`);
  }
  document.moveDown();
  document.fontSize(11).text('Activity', { underline: true });
  for (const item of report.activity) {
    addPageWhenNeeded(30);
    document
      .fontSize(9)
      .text(
        `${item.createdAt.toISOString()} - ${item.staff?.username ?? 'Legacy/System'} - ${item.action.replaceAll('_', ' ')}${item.roomNumber ? ` - Room ${item.roomNumber}` : ''}${item.bookingId ? ` - Booking #${item.bookingId}` : ''}${item.amountCentavos !== null ? ` - ${money(item.amountCentavos)}` : ''}`,
      );
  }
  document.end();
  return finished;
}

async function createOwnerWorkbook(report: OwnerReport): Promise<Buffer> {
  const header = (value: string) => ({
    value,
    fontWeight: 'bold' as const,
    backgroundColor: '#E5E5E5',
  });
  const data: SheetData = [
    [
      {
        value: "OHA Traveller's Inn Owner Report",
        fontWeight: 'bold',
        fontSize: 16,
      },
    ],
    [{ value: 'Period' }, { value: report.filters.label }],
    [{ value: 'Shift' }, { value: report.filters.shift }],
    [
      { value: 'View' },
      { value: report.selectedStaff?.username ?? 'Overall motel' },
    ],
    [],
    [header('Operational summary'), header('Value')],
    [{ value: 'Check-ins' }, { value: report.summary.totalCheckIns }],
    [{ value: 'Completed stays' }, { value: report.summary.completedStays }],
    [{ value: 'Active stays created' }, { value: report.summary.activeStays }],
    [{ value: 'Unique rooms used' }, { value: report.summary.uniqueRoomsUsed }],
    [{ value: 'Extensions' }, { value: report.summary.extensionCount }],
    [
      { value: 'Overdue checkouts' },
      { value: report.summary.overdueCheckoutCount },
    ],
    [],
    [header('Financial summary'), header('PHP')],
    [
      { value: 'Room charges' },
      {
        value: report.financial.grossRoomRevenueCentavos / 100,
        format: '₱#,##0.00',
      },
    ],
    [
      { value: 'Extension charges' },
      {
        value: report.financial.extensionRevenueCentavos / 100,
        format: '₱#,##0.00',
      },
    ],
    [
      { value: 'Gross revenue' },
      {
        value: report.financial.grossRevenueCentavos / 100,
        format: '₱#,##0.00',
      },
    ],
    [
      { value: 'Net revenue' },
      { value: report.financial.netRevenueCentavos / 100, format: '₱#,##0.00' },
    ],
    [],
    [header('Package'), header('Check-ins'), header('Revenue')],
    ...report.packages.map((item) => [
      { value: `${item.durationHours} hours` },
      { value: item.count },
      { value: item.revenueCentavos / 100, format: '₱#,##0.00' },
    ]),
    [],
    [header('Room'), header('Type'), header('Uses')],
    ...report.roomUsage.map((item) => [
      { value: item.roomNumber },
      { value: item.roomType },
      { value: item.uses },
    ]),
    [],
    [header('Vehicle type'), header('Arrivals')],
    ...report.vehicleTypes.map((item) => [
      { value: item.type.replaceAll('_', ' ') },
      { value: item.count },
    ]),
    [],
    [
      header('Activity time'),
      header('Staff'),
      header('Action'),
      header('Room'),
      header('Stay ID'),
      header('Booking ID'),
      header('Amount'),
    ],
    ...report.activity.map((item) => [
      { value: item.createdAt, format: 'yyyy-mm-dd hh:mm' },
      { value: item.staff?.username ?? 'Legacy/System' },
      { value: item.action.replaceAll('_', ' ') },
      { value: item.roomNumber ?? '' },
      { value: item.stayId ?? '' },
      { value: item.bookingId ?? '' },
      item.amountCentavos === null
        ? { value: '' }
        : { value: item.amountCentavos / 100, format: '₱#,##0.00' },
    ]),
  ];
  return writeXlsxFile(data, {
    columns: [24, 22, 20, 16, 14, 14, 16].map((width) => ({ width })),
  }).toBuffer();
}

export function createReportsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/owner', async (request, response) => {
    try {
      response.json({
        data: await buildOwnerReport(prisma, ownerReportOptions(request.query)),
      });
    } catch (error: unknown) {
      response.status(400).json({
        message:
          error instanceof Error ? error.message : 'The report is invalid.',
      });
    }
  });

  router.get('/owner.pdf', async (request, response) => {
    try {
      const report = await buildOwnerReport(
        prisma,
        ownerReportOptions(request.query),
      );
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${ownerReportFilename(report, 'pdf')}"`,
      );
      response.send(await createOwnerPdf(report));
    } catch (error: unknown) {
      response.status(400).json({
        message:
          error instanceof Error ? error.message : 'The report is invalid.',
      });
    }
  });

  router.get('/owner.xlsx', async (request, response) => {
    try {
      const report = await buildOwnerReport(
        prisma,
        ownerReportOptions(request.query),
      );
      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${ownerReportFilename(report, 'xlsx')}"`,
      );
      response.send(await createOwnerWorkbook(report));
    } catch (error: unknown) {
      response.status(400).json({
        message:
          error instanceof Error ? error.message : 'The report is invalid.',
      });
    }
  });

  return router;
}
