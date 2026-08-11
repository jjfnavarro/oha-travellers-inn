import {
  FinancialTransactionType,
  PaymentMethod,
  ProductCategory,
  type PrismaClient,
} from '@prisma/client';
import {
  isInShift,
  resolveOwnerReportWindow,
  type OwnerReportOptions,
} from './owner-report.js';
import { buildRevenueTrend } from './revenue-trend.js';

export async function buildStoreReport(
  prisma: PrismaClient,
  options: OwnerReportOptions,
) {
  const now = options.now ?? new Date();
  const window = resolveOwnerReportWindow({ ...options, now });
  const timestampRange = { gte: window.startsAt, lt: window.endsAt };
  const selectedStaff = options.staffId
    ? await prisma.staffAccount.findFirst({
        where: { id: options.staffId, isActive: true },
        select: { id: true, username: true, role: true },
      })
    : null;
  if (options.staffId && !selectedStaff) {
    throw new Error('The selected active staff account was not found.');
  }

  const [sales, transactions] = await Promise.all([
    prisma.storeSale.findMany({
      where: { createdAt: timestampRange },
      include: {
        items: true,
        handledBy: { select: { id: true, username: true } },
        stay: { select: { id: true, room: { select: { number: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.financialTransaction.findMany({
      where: {
        createdAt: timestampRange,
        transactionType: {
          in: [
            FinancialTransactionType.STORE_SALE,
            FinancialTransactionType.EXTRA_CHARGE,
          ],
        },
      },
      include: { handledBy: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const selectedSales = sales.filter(
    (sale) =>
      isInShift(sale.createdAt, options.shift) &&
      (!options.staffId || sale.handledByUserId === options.staffId) &&
      (!options.paymentMethod || sale.paymentMethod === options.paymentMethod),
  );
  const selectedTransactions = transactions.filter(
    (transaction) =>
      isInShift(transaction.createdAt, options.shift) &&
      (!options.staffId || transaction.handledById === options.staffId) &&
      (!options.paymentMethod ||
        transaction.paymentMethod === options.paymentMethod),
  );
  const sum = (items: typeof selectedTransactions) =>
    items.reduce((total, item) => total + item.amountCentavos, 0);
  const storeRevenueCentavos = sum(
    selectedTransactions.filter(
      (item) => item.transactionType === FinancialTransactionType.STORE_SALE,
    ),
  );
  const extraChargesRevenueCentavos = sum(
    selectedTransactions.filter(
      (item) => item.transactionType === FinancialTransactionType.EXTRA_CHARGE,
    ),
  );

  const products = new Map<
    string,
    {
      productId: number;
      name: string;
      category: ProductCategory;
      quantity: number;
      salesCount: number;
      revenueCentavos: number;
    }
  >();
  for (const sale of selectedSales) {
    for (const item of sale.items) {
      const snapshotKey = `${item.productId}:${item.categorySnapshot}:${item.productNameSnapshot}`;
      const product = products.get(snapshotKey) ?? {
        productId: item.productId,
        name: item.productNameSnapshot,
        category: item.categorySnapshot,
        quantity: 0,
        salesCount: 0,
        revenueCentavos: 0,
      };
      product.quantity += item.quantity;
      product.salesCount += 1;
      product.revenueCentavos += item.lineTotalCentavos;
      products.set(snapshotKey, product);
    }
  }

  const staff = new Map<
    number,
    {
      staffId: number;
      username: string;
      salesCount: number;
      storeRevenueCentavos: number;
      extraChargesRevenueCentavos: number;
      totalRevenueCentavos: number;
    }
  >();
  for (const transaction of selectedTransactions) {
    if (!transaction.handledById || !transaction.handledBy) continue;
    const entry = staff.get(transaction.handledById) ?? {
      staffId: transaction.handledById,
      username: transaction.handledBy.username,
      salesCount: 0,
      storeRevenueCentavos: 0,
      extraChargesRevenueCentavos: 0,
      totalRevenueCentavos: 0,
    };
    entry.salesCount += 1;
    entry.totalRevenueCentavos += transaction.amountCentavos;
    if (transaction.transactionType === FinancialTransactionType.STORE_SALE) {
      entry.storeRevenueCentavos += transaction.amountCentavos;
    } else {
      entry.extraChargesRevenueCentavos += transaction.amountCentavos;
    }
    staff.set(entry.staffId, entry);
  }

  const productBreakdown = [...products.values()].sort(
    (left, right) =>
      right.quantity - left.quantity || left.name.localeCompare(right.name),
  );
  const revenueTrend = buildRevenueTrend(
    selectedTransactions,
    window.startsAt,
    window.endsAt,
    ['week', 'month', 'custom'].includes(options.preset) ? 'DAY' : 'HOUR',
  );
  return {
    generatedAt: now,
    viewMode: selectedStaff ? ('BY_STAFF' as const) : ('OVERALL' as const),
    selectedStaff,
    filters: {
      preset: options.preset,
      shift: options.shift,
      paymentMethod: options.paymentMethod ?? ('ALL' as const),
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      label: window.label,
    },
    summary: {
      storeRevenueCentavos,
      extraChargesRevenueCentavos,
      totalRevenueCentavos: storeRevenueCentavos + extraChargesRevenueCentavos,
      salesCount: selectedSales.length,
      itemsSold: selectedSales.reduce(
        (total, sale) =>
          total +
          sale.items.reduce((quantity, item) => quantity + item.quantity, 0),
        0,
      ),
    },
    revenueTrend,
    paymentMethods: (options.paymentMethod
      ? [options.paymentMethod]
      : [PaymentMethod.CASH, PaymentMethod.GCASH]
    ).map((method) => {
      const matching = selectedTransactions.filter(
        (transaction) => transaction.paymentMethod === method,
      );
      return { method, count: matching.length, amountCentavos: sum(matching) };
    }),
    products: productBreakdown,
    topProducts: productBreakdown.slice(0, 10),
    staff: [...staff.values()].sort(
      (left, right) =>
        right.totalRevenueCentavos - left.totalRevenueCentavos ||
        left.username.localeCompare(right.username),
    ),
    activity: selectedSales.map((sale) => ({
      id: sale.id,
      createdAt: sale.createdAt,
      staff: sale.handledBy,
      stayId: sale.stayId,
      roomNumber: sale.stay?.room.number ?? null,
      paymentMethod: sale.paymentMethod,
      totalAmountCentavos: sale.totalAmountCentavos,
      items: sale.items.map((item) => ({
        productId: item.productId,
        name: item.productNameSnapshot,
        category: item.categorySnapshot,
        unitPriceCentavos: item.unitPriceCentavos,
        quantity: item.quantity,
        lineTotalCentavos: item.lineTotalCentavos,
      })),
    })),
  };
}

export type StoreReport = Awaited<ReturnType<typeof buildStoreReport>>;
