import PDFDocument from 'pdfkit';
import writeXlsxFile, { type SheetData } from 'write-excel-file/node';

export interface StayHistoryExportRecord {
  id: number;
  status: string;
  arrivalType: string;
  vehicleType: string | null;
  guestName: string | null;
  plateNumber: string | null;
  notes: string | null;
  durationHours: number;
  numberOfDays?: number | null;
  paidAmountCentavos: number;
  checkedInAt: Date;
  expectedCheckoutAt: Date;
  checkedOutAt: Date | null;
  room: { number: string; roomType: { name: string } };
  shift: { type: string } | null;
  checkedInBy: { username: string } | null;
  checkedOutBy: { username: string } | null;
  storeSales: {
    totalAmountCentavos: number;
    paymentMethod: string;
    handledBy: { username: string };
    items: { productNameSnapshot: string; quantity: number }[];
  }[];
}

function money(centavos: number): string {
  return `PHP ${(centavos / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
  })}`;
}

function dateTime(value: Date | null): string {
  if (!value) return 'Active';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function checkoutResult(stay: StayHistoryExportRecord): string {
  if (!stay.checkedOutAt)
    return stay.status === 'ACTIVE' ? 'Active' : stay.status;
  const difference =
    stay.checkedOutAt.getTime() - stay.expectedCheckoutAt.getTime();
  if (difference < 0) return 'Early';
  if (difference > 0) return 'Overdue';
  return 'On time';
}

function arrival(stay: StayHistoryExportRecord): string {
  if (stay.arrivalType === 'WALK_IN') return 'Walk-in';
  return ['Vehicle', stay.vehicleType?.replaceAll('_', ' '), stay.plateNumber]
    .filter(Boolean)
    .join(' - ');
}

function storePurchases(stay: StayHistoryExportRecord): string {
  return stay.storeSales
    .flatMap((sale) =>
      sale.items.map(
        (item) =>
          `${item.quantity} x ${item.productNameSnapshot} (${money(sale.totalAmountCentavos)}, ${sale.paymentMethod === 'GCASH' ? 'GCash' : sale.paymentMethod === 'CARD' ? 'Card' : 'Cash'})`,
      ),
    )
    .join('; ');
}

export async function createStayHistoryPdf(
  stays: StayHistoryExportRecord[],
): Promise<Buffer> {
  const document = new PDFDocument({ margin: 38, size: 'A4' });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });

  document.fontSize(18).text("OHA Traveller's Inn", { align: 'center' });
  document.fontSize(13).text('Stay History', { align: 'center' });
  document.moveDown(0.5);
  document
    .fontSize(9)
    .text(`Generated: ${dateTime(new Date())}`)
    .text(`Records: ${stays.length}`)
    .moveDown();

  for (const stay of stays) {
    if (document.y > 700) document.addPage();
    document
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(
        `Room ${stay.room.number} - ${stay.room.roomType.name} | ${checkoutResult(stay)}`,
      );
    document
      .font('Helvetica')
      .fontSize(8.5)
      .text(
        `Check-in: ${dateTime(stay.checkedInAt)} | Expected checkout: ${dateTime(stay.expectedCheckoutAt)} | Checkout: ${dateTime(stay.checkedOutAt)}`,
      )
      .text(
        `Stay: ${stay.numberOfDays ? `${stay.numberOfDays} ${stay.numberOfDays === 1 ? 'day' : 'days'} (${stay.durationHours} hours)` : `${stay.durationHours} hours`} | Room payment: ${money(stay.paidAmountCentavos)} | Shift: ${stay.shift?.type ?? 'Not recorded'}`,
      )
      .text(
        `Arrival: ${arrival(stay)} | Guest: ${stay.guestName ?? 'Not recorded'}`,
      )
      .text(
        `Employees: In - ${stay.checkedInBy?.username ?? 'Legacy record'} | Out - ${stay.checkedOutBy?.username ?? 'Not checked out'}`,
      );
    const purchases = storePurchases(stay);
    if (purchases) document.text(`Store purchases: ${purchases}`);
    if (stay.notes) document.text(`Notes: ${stay.notes}`);
    document.moveDown(0.45);
    document
      .strokeColor('#D0D0D0')
      .moveTo(38, document.y)
      .lineTo(557, document.y)
      .stroke()
      .moveDown(0.65);
  }

  if (stays.length === 0) {
    document.fontSize(10).text('No stays match the selected filters.');
  }
  document.end();
  return finished;
}

export async function createStayHistoryWorkbook(
  stays: StayHistoryExportRecord[],
): Promise<Buffer> {
  const header = (value: string) => ({
    value,
    fontWeight: 'bold' as const,
    backgroundColor: '#E5E5E5',
  });
  const data: SheetData = [
    [
      {
        value: "OHA Traveller's Inn Stay History",
        fontWeight: 'bold',
        fontSize: 16,
      },
    ],
    [{ value: 'Generated' }, { value: new Date(), format: 'yyyy-mm-dd hh:mm' }],
    [{ value: 'Records' }, { value: stays.length }],
    [],
    [
      header('Stay ID'),
      header('Room'),
      header('Room type'),
      header('Check-in'),
      header('Expected checkout'),
      header('Checkout'),
      header('Duration hours'),
      header('Days'),
      header('Arrival'),
      header('Vehicle type'),
      header('Plate number'),
      header('Guest name'),
      header('Room payment'),
      header('Shift'),
      header('Checked in by'),
      header('Checked out by'),
      header('Result'),
      header('Store purchases'),
      header('Notes'),
    ],
    ...stays.map((stay) => [
      { value: stay.id },
      { value: stay.room.number },
      { value: stay.room.roomType.name },
      { value: stay.checkedInAt, format: 'yyyy-mm-dd hh:mm' },
      { value: stay.expectedCheckoutAt, format: 'yyyy-mm-dd hh:mm' },
      stay.checkedOutAt
        ? { value: stay.checkedOutAt, format: 'yyyy-mm-dd hh:mm' }
        : { value: 'Active' },
      { value: stay.durationHours },
      { value: stay.numberOfDays ?? '' },
      { value: stay.arrivalType === 'WALK_IN' ? 'Walk-in' : 'Vehicle' },
      { value: stay.vehicleType?.replaceAll('_', ' ') ?? '' },
      { value: stay.plateNumber ?? '' },
      { value: stay.guestName ?? '' },
      { value: stay.paidAmountCentavos / 100, format: 'PHP #,##0.00' },
      { value: stay.shift?.type ?? '' },
      { value: stay.checkedInBy?.username ?? 'Legacy record' },
      { value: stay.checkedOutBy?.username ?? '' },
      { value: checkoutResult(stay) },
      { value: storePurchases(stay) },
      { value: stay.notes ?? '' },
    ]),
  ];

  return writeXlsxFile(data, {
    columns: [
      10, 10, 16, 20, 20, 20, 14, 12, 16, 16, 20, 16, 10, 16, 16, 12, 42, 30,
    ].map((width) => ({ width })),
  }).toBuffer();
}
