import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import writeXlsxFile, { type SheetData } from 'write-excel-file/node';
import { z } from 'zod';
import {
  buildDailyReport,
  buildStatistics,
  type DailyReport,
  type StatisticsPeriod,
} from '../services/report.js';
import { currentOperationalDate } from '../services/shift-time.js';

function reportDate(value: unknown): string {
  const result = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(value);
  return result.success ? result.data : currentOperationalDate();
}

function money(centavos: number): string {
  return `PHP ${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function checkoutResult(stay: DailyReport['stays'][number]): string {
  if (!stay.checkedOutAt) return stay.status;
  if (stay.checkedOutAt < stay.expectedCheckoutAt) return 'EARLY';
  if (stay.checkedOutAt > stay.expectedCheckoutAt) return 'OVERDUE';
  return 'ON TIME';
}

async function createPdf(report: DailyReport): Promise<Buffer> {
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
    .text(`Operational Day Report · ${report.date}`, { align: 'center' });
  document.moveDown();
  document.fontSize(10).text(`Total stays: ${report.summary.totalStays}`);
  document.text(
    `Total room payments: ${money(report.summary.totalAmountCentavos)}`,
  );
  document.text(
    `Vehicle: ${report.summary.vehicleStays}  Walk-in: ${report.summary.walkInStays}`,
  );
  document.text(
    `Early checkouts: ${report.summary.earlyCheckouts}  Overdue checkouts: ${report.summary.overdueCheckouts}`,
  );
  document.moveDown();
  document.fontSize(11).text('Stay Details', { underline: true });
  document.moveDown(0.5);
  for (const stay of report.stays) {
    if (document.y > 740) document.addPage();
    document
      .fontSize(9)
      .text(
        `Room ${stay.room.number} · ${stay.room.roomType.name} · ${stay.durationHours}h · ${money(stay.paidAmountCentavos)} · ${checkoutResult(stay)}`,
      );
    document
      .fillColor('#555555')
      .text(
        `${stay.checkedInAt.toISOString()} → ${stay.checkedOutAt?.toISOString() ?? 'Active'}`,
      );
    document.fillColor('#000000').moveDown(0.5);
  }
  document.end();
  return finished;
}

async function createWorkbook(report: DailyReport): Promise<Buffer> {
  const header = (value: string) => ({
    value,
    fontWeight: 'bold' as const,
    backgroundColor: '#E5E5E5',
  });
  const data: SheetData = [
    [
      { value: "OHA Traveller's Inn", fontWeight: 'bold', fontSize: 16 },
      { value: '' },
    ],
    [{ value: 'Operational day' }, { value: report.date }],
    [{ value: 'Total stays' }, { value: report.summary.totalStays }],
    [
      { value: 'Total room payments' },
      { value: report.summary.totalAmountCentavos / 100, format: '₱#,##0.00' },
    ],
    [{ value: 'Active stays' }, { value: report.summary.activeStays }],
    [{ value: 'Vehicle stays' }, { value: report.summary.vehicleStays }],
    [{ value: 'Walk-in stays' }, { value: report.summary.walkInStays }],
    [{ value: 'Early checkouts' }, { value: report.summary.earlyCheckouts }],
    [
      { value: 'Overdue checkouts' },
      { value: report.summary.overdueCheckouts },
    ],
    [],
    [
      header('ID'),
      header('Room'),
      header('Type'),
      header('Shift'),
      header('Arrival'),
      header('Guest'),
      header('Plate'),
      header('Hours'),
      header('Paid'),
      header('Check-in'),
      header('Expected checkout'),
      header('Actual checkout'),
      header('Result'),
    ],
  ];
  for (const stay of report.stays) {
    data.push([
      { value: stay.id },
      { value: stay.room.number },
      { value: stay.room.roomType.name },
      { value: stay.shift?.type ?? '' },
      { value: stay.arrivalType },
      { value: stay.guestName ?? '' },
      { value: stay.plateNumber ?? '' },
      { value: stay.durationHours },
      { value: stay.paidAmountCentavos / 100, format: '₱#,##0.00' },
      { value: stay.checkedInAt, format: 'yyyy-mm-dd hh:mm' },
      { value: stay.expectedCheckoutAt, format: 'yyyy-mm-dd hh:mm' },
      { value: stay.checkedOutAt ?? '', format: 'yyyy-mm-dd hh:mm' },
      { value: checkoutResult(stay) },
    ]);
  }
  return writeXlsxFile(data, {
    columns: [10, 10, 16, 12, 14, 22, 16, 10, 14, 22, 22, 22, 14].map(
      (width) => ({ width }),
    ),
  }).toBuffer();
}

export function createReportsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/statistics', async (request, response) => {
    const period = z
      .enum(['day', 'week', 'month'])
      .catch('day')
      .parse(request.query.period);
    response.json({
      data: await buildStatistics(
        prisma,
        reportDate(request.query.date),
        period as StatisticsPeriod,
      ),
    });
  });

  router.get('/daily', async (request, response) => {
    try {
      response.json({
        data: await buildDailyReport(prisma, reportDate(request.query.date)),
      });
    } catch (error: unknown) {
      response.status(400).json({
        message:
          error instanceof Error ? error.message : 'Invalid report date.',
      });
    }
  });

  router.get('/daily.pdf', async (request, response) => {
    const date = reportDate(request.query.date);
    const buffer = await createPdf(await buildDailyReport(prisma, date));
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="oha-report-${date}.pdf"`,
    );
    response.send(buffer);
  });

  router.get('/daily.xlsx', async (request, response) => {
    const date = reportDate(request.query.date);
    const buffer = await createWorkbook(await buildDailyReport(prisma, date));
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="oha-report-${date}.xlsx"`,
    );
    response.send(buffer);
  });

  return router;
}
