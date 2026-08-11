import type { RevenueTrendPoint } from '../services/revenue-trend.js';

interface BreakdownItem {
  label: string;
  amountCentavos: number;
  color: string;
}

const money = (centavos: number) =>
  `PHP ${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

function ensureSpace(document: PDFKit.PDFDocument, height: number) {
  if (document.y + height > document.page.height - 45) document.addPage();
}

export function drawRevenueCharts(
  document: PDFKit.PDFDocument,
  trend: RevenueTrendPoint[],
  breakdown: BreakdownItem[],
) {
  ensureSpace(document, 330);
  document.fontSize(11).fillColor('#111111').text('Revenue trend', {
    underline: true,
  });

  const chartX = 55;
  const chartY = document.y + 12;
  const chartWidth = 485;
  const chartHeight = 105;
  const maximum = Math.max(
    1,
    ...trend.map((point) => point.totalRevenueCentavos),
  );
  document
    .save()
    .strokeColor('#b5b5b5')
    .lineWidth(0.7)
    .moveTo(chartX, chartY)
    .lineTo(chartX, chartY + chartHeight)
    .lineTo(chartX + chartWidth, chartY + chartHeight)
    .stroke();

  if (trend.length === 1) {
    const pointY =
      chartY +
      chartHeight -
      (trend[0]!.totalRevenueCentavos / maximum) * chartHeight;
    document.circle(chartX + chartWidth / 2, pointY, 3).fill('#1c1c1c');
  } else if (trend.length > 1) {
    document.strokeColor('#1c1c1c').lineWidth(2);
    trend.forEach((point, index) => {
      const x = chartX + (index / (trend.length - 1)) * chartWidth;
      const y =
        chartY +
        chartHeight -
        (point.totalRevenueCentavos / maximum) * chartHeight;
      if (index === 0) document.moveTo(x, y);
      else document.lineTo(x, y);
    });
    document.stroke();
  }
  document.restore();

  const labelIndexes = [
    ...new Set([0, Math.floor((trend.length - 1) / 2), trend.length - 1]),
  ];
  for (const index of labelIndexes) {
    const point = trend[index];
    if (!point) continue;
    const x =
      trend.length <= 1
        ? chartX + chartWidth / 2
        : chartX + (index / (trend.length - 1)) * chartWidth;
    document
      .fontSize(7)
      .fillColor('#555555')
      .text(point.label, x - 25, chartY + chartHeight + 5, {
        width: 50,
        align: 'center',
      });
  }
  document
    .fontSize(7)
    .fillColor('#555555')
    .text(money(maximum), chartX + 4, chartY + 3, { width: 100 });

  document.y = chartY + chartHeight + 28;
  document.fontSize(11).fillColor('#111111').text('Revenue breakdown', {
    underline: true,
  });
  let barY = document.y + 8;
  const barMaximum = Math.max(
    1,
    ...breakdown.map((item) => item.amountCentavos),
  );
  for (const item of breakdown) {
    document.fontSize(8).fillColor('#222222').text(item.label, chartX, barY, {
      width: 80,
    });
    const width = (item.amountCentavos / barMaximum) * 260;
    document.rect(chartX + 85, barY, Math.max(width, 1), 10).fill(item.color);
    document
      .fontSize(8)
      .fillColor('#222222')
      .text(money(item.amountCentavos), chartX + 355, barY - 1, {
        width: 130,
        align: 'right',
      });
    barY += 20;
  }
  document.fillColor('#111111');
  document.y = barY + 6;
}
