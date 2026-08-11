import {
  FinancialTransactionType,
  PaymentMethod,
  StayStatus,
  VehicleType,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import {
  currentOperationalDate,
  getOperationalDay,
  getShiftWindow,
} from './shift-time.js';
import { buildRevenueTrend } from './revenue-trend.js';

export type OwnerReportPreset =
  | 'current_shift'
  | 'previous_shift'
  | 'today'
  | 'specific_date'
  | 'week'
  | 'month'
  | 'custom';
export type OwnerReportShift = 'ALL' | 'DAY' | 'NIGHT';
export type OwnerReportScope = 'OVERALL' | 'ROOMS';

export interface OwnerReportOptions {
  preset: OwnerReportPreset;
  shift: OwnerReportShift;
  scope?: OwnerReportScope | undefined;
  paymentMethod?: PaymentMethod | undefined;
  date?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  staffId?: number | undefined;
  now?: Date | undefined;
}

interface ReportWindow {
  startsAt: Date;
  endsAt: Date;
  label: string;
}

const staySelect = {
  id: true,
  roomId: true,
  status: true,
  arrivalType: true,
  vehicleType: true,
  durationHours: true,
  checkedInAt: true,
  expectedCheckoutAt: true,
  checkedOutAt: true,
  checkedInById: true,
  checkedOutById: true,
  room: { select: { number: true, roomType: { select: { name: true } } } },
  checkedInBy: { select: { id: true, username: true } },
  checkedOutBy: { select: { id: true, username: true } },
} satisfies Prisma.StaySelect;

const transactionSelect = {
  id: true,
  stayId: true,
  handledById: true,
  transactionType: true,
  amountCentavos: true,
  paymentMethod: true,
  createdAt: true,
  handledBy: { select: { id: true, username: true } },
  stay: {
    select: {
      durationHours: true,
      room: { select: { number: true } },
    },
  },
} satisfies Prisma.FinancialTransactionSelect;

const extensionSelect = {
  id: true,
  stayId: true,
  createdById: true,
  durationHours: true,
  amountCentavos: true,
  paymentMethod: true,
  createdAt: true,
  createdBy: { select: { id: true, username: true } },
  stay: { select: { room: { select: { number: true } } } },
} satisfies Prisma.StayExtensionSelect;

function weekWindow(date: string): ReportWindow {
  const selected = getOperationalDay(date);
  const weekday = selected.startsAt.getUTCDay();
  const startsAt = new Date(
    selected.startsAt.getTime() - weekday * 24 * 60 * 60 * 1000,
  );
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    label: `Week of ${startsAt.toISOString().slice(0, 10)}`,
  };
}

function monthWindow(date: string): ReportWindow {
  const selected = getOperationalDay(date);
  const startsAt = new Date(
    Date.UTC(
      selected.startsAt.getUTCFullYear(),
      selected.startsAt.getUTCMonth(),
      1,
    ),
  );
  return {
    startsAt,
    endsAt: new Date(
      Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth() + 1, 1),
    ),
    label: `Month containing ${date}`,
  };
}

export function resolveOwnerReportWindow(
  options: OwnerReportOptions,
): ReportWindow {
  const now = options.now ?? new Date();
  if (options.preset === 'current_shift') {
    const window = getShiftWindow(now);
    return { ...window, label: 'Current shift' };
  }
  if (options.preset === 'previous_shift') {
    const current = getShiftWindow(now);
    const window = getShiftWindow(new Date(current.startsAt.getTime() - 1));
    return { ...window, label: 'Previous shift' };
  }

  const referenceDate = options.date ?? currentOperationalDate(now);
  if (options.preset === 'week') return weekWindow(referenceDate);
  if (options.preset === 'month') return monthWindow(referenceDate);
  if (options.preset === 'custom') {
    if (!options.from || !options.to) {
      throw new Error('Select both the start and end date.');
    }
    const from = getOperationalDay(options.from);
    const to = getOperationalDay(options.to);
    if (from.startsAt > to.startsAt) {
      throw new Error('The start date must be on or before the end date.');
    }
    return {
      startsAt: from.startsAt,
      endsAt: to.endsAt,
      label: `${options.from} through ${options.to}`,
    };
  }

  const window = getOperationalDay(referenceDate);
  return {
    ...window,
    label:
      options.preset === 'specific_date'
        ? `Operational day ${referenceDate}`
        : 'Today',
  };
}

function isInWindow(timestamp: Date | null, window: ReportWindow): boolean {
  return Boolean(
    timestamp && timestamp >= window.startsAt && timestamp < window.endsAt,
  );
}

export function isInShift(timestamp: Date, shift: OwnerReportShift): boolean {
  return shift === 'ALL' || getShiftWindow(timestamp).type === shift;
}

function detailsRecord(
  value: Prisma.JsonValue | null,
): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function numberDetail(
  details: Record<string, unknown>,
  key: string,
): number | null {
  return typeof details[key] === 'number' ? details[key] : null;
}

export async function buildOwnerReport(
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

  const [stays, transactions, extensions, auditLogs] = await Promise.all([
    prisma.stay.findMany({
      where: {
        OR: [{ checkedInAt: timestampRange }, { checkedOutAt: timestampRange }],
      },
      select: staySelect,
    }),
    prisma.financialTransaction.findMany({
      where: { createdAt: timestampRange },
      select: transactionSelect,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.stayExtension.findMany({
      where: { createdAt: timestampRange },
      select: extensionSelect,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.auditLog.findMany({
      where: { createdAt: timestampRange },
      include: { staff: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);

  const checkIns = stays.filter(
    (stay) =>
      isInWindow(stay.checkedInAt, window) &&
      isInShift(stay.checkedInAt, options.shift) &&
      (!options.staffId || stay.checkedInById === options.staffId),
  );
  const completed = stays.filter(
    (stay) =>
      stay.status === StayStatus.COMPLETED &&
      isInWindow(stay.checkedOutAt, window) &&
      Boolean(
        stay.checkedOutAt && isInShift(stay.checkedOutAt, options.shift),
      ) &&
      (!options.staffId || stay.checkedOutById === options.staffId),
  );
  const selectedTransactions = transactions.filter(
    (transaction) =>
      isInShift(transaction.createdAt, options.shift) &&
      (!options.staffId || transaction.handledById === options.staffId) &&
      (!options.paymentMethod ||
        transaction.paymentMethod === options.paymentMethod) &&
      (options.scope !== 'ROOMS' ||
        transaction.transactionType === FinancialTransactionType.ROOM_CHARGE ||
        transaction.transactionType ===
          FinancialTransactionType.EXTENSION_CHARGE),
  );
  const selectedExtensions = extensions.filter(
    (extension) =>
      isInShift(extension.createdAt, options.shift) &&
      (!options.staffId || extension.createdById === options.staffId),
  );
  const selectedAuditLogs = auditLogs.filter(
    (log) =>
      isInShift(log.createdAt, options.shift) &&
      (!options.staffId || log.staffId === options.staffId) &&
      (options.scope !== 'ROOMS' ||
        (log.entityType !== 'STORE_SALE' && log.entityType !== 'PRODUCT')),
  );

  const activityStayIds = selectedAuditLogs
    .filter((log) => log.entityType === 'STAY' && log.entityId)
    .map((log) => Number(log.entityId))
    .filter(Number.isInteger);
  const activityRoomIds = selectedAuditLogs
    .filter((log) => log.entityType === 'ROOM' && log.entityId)
    .map((log) => Number(log.entityId))
    .filter(Number.isInteger);
  const [activityStays, activityRooms] = await Promise.all([
    activityStayIds.length
      ? prisma.stay.findMany({
          where: { id: { in: activityStayIds } },
          select: { id: true, room: { select: { number: true } } },
        })
      : [],
    activityRoomIds.length
      ? prisma.room.findMany({
          where: { id: { in: activityRoomIds } },
          select: { id: true, number: true },
        })
      : [],
  ]);
  const stayRoom = new Map(
    activityStays.map((stay) => [stay.id, stay.room.number]),
  );
  const roomNumber = new Map(
    activityRooms.map((room) => [room.id, room.number]),
  );

  const roomChargeTransactions = selectedTransactions.filter(
    (item) => item.transactionType === FinancialTransactionType.ROOM_CHARGE,
  );
  const extensionTransactions = selectedTransactions.filter(
    (item) =>
      item.transactionType === FinancialTransactionType.EXTENSION_CHARGE,
  );
  const storeTransactions = selectedTransactions.filter(
    (item) => item.transactionType === FinancialTransactionType.STORE_SALE,
  );
  const extraChargeTransactions = selectedTransactions.filter(
    (item) => item.transactionType === FinancialTransactionType.EXTRA_CHARGE,
  );
  const sum = (items: typeof selectedTransactions) =>
    items.reduce((total, item) => total + item.amountCentavos, 0);

  const packageMap = new Map<
    number,
    { durationHours: number; count: number; revenueCentavos: number }
  >();
  for (const durationHours of [3, 6, 12, 24]) {
    packageMap.set(durationHours, {
      durationHours,
      count: 0,
      revenueCentavos: 0,
    });
  }
  for (const stay of checkIns) {
    const item = packageMap.get(stay.durationHours) ?? {
      durationHours: stay.durationHours,
      count: 0,
      revenueCentavos: 0,
    };
    item.count += 1;
    packageMap.set(stay.durationHours, item);
  }
  for (const transaction of roomChargeTransactions) {
    if (!transaction.stay) continue;
    const durationHours = transaction.stay.durationHours;
    const item = packageMap.get(durationHours) ?? {
      durationHours,
      count: 0,
      revenueCentavos: 0,
    };
    item.revenueCentavos += transaction.amountCentavos;
    packageMap.set(durationHours, item);
  }

  const usageMap = new Map<
    number,
    { roomId: number; roomNumber: string; roomType: string; uses: number }
  >();
  for (const stay of checkIns) {
    const item = usageMap.get(stay.roomId) ?? {
      roomId: stay.roomId,
      roomNumber: stay.room.number,
      roomType: stay.room.roomType.name,
      uses: 0,
    };
    item.uses += 1;
    usageMap.set(stay.roomId, item);
  }

  const reportPaymentMethods = options.paymentMethod
    ? [options.paymentMethod]
    : Object.values(PaymentMethod);
  const paymentMethods = reportPaymentMethods.map((method) => ({
    method,
    count: selectedTransactions.filter((item) => item.paymentMethod === method)
      .length,
    amountCentavos: sum(
      selectedTransactions.filter((item) => item.paymentMethod === method),
    ),
  }));
  const vehicleTypes = Object.values(VehicleType).map((type) => ({
    type,
    count: checkIns.filter((stay) => stay.vehicleType === type).length,
  }));
  const grossRoomRevenueCentavos = sum(roomChargeTransactions);
  const extensionRevenueCentavos = sum(extensionTransactions);
  const storeRevenueCentavos = sum(storeTransactions);
  const extraChargesRevenueCentavos = sum(extraChargeTransactions);
  const grossRevenueCentavos = sum(selectedTransactions);
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
      scope: options.scope ?? ('OVERALL' as const),
      paymentMethod: options.paymentMethod ?? ('ALL' as const),
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      label: window.label,
    },
    summary: {
      totalCheckIns: checkIns.length,
      completedStays: completed.length,
      activeStays: checkIns.filter((stay) => stay.status === StayStatus.ACTIVE)
        .length,
      totalRoomUses: checkIns.length,
      uniqueRoomsUsed: new Set(checkIns.map((stay) => stay.roomId)).size,
      walkInCount: checkIns.filter((stay) => stay.arrivalType === 'WALK_IN')
        .length,
      vehicleCount: checkIns.filter((stay) => stay.arrivalType === 'VEHICLE')
        .length,
      extensionCount: selectedExtensions.length,
      overdueCheckoutCount:
        completed.filter(
          (stay) =>
            stay.checkedOutAt && stay.checkedOutAt > stay.expectedCheckoutAt,
        ).length +
        checkIns.filter(
          (stay) =>
            stay.status === StayStatus.ACTIVE && stay.expectedCheckoutAt < now,
        ).length,
    },
    financial: {
      grossRoomRevenueCentavos,
      extensionRevenueCentavos,
      storeRevenueCentavos,
      extraChargesRevenueCentavos,
      grossRevenueCentavos,
      netRevenueCentavos: grossRevenueCentavos,
      totalCollectedCentavos: grossRevenueCentavos,
    },
    revenueTrend,
    packages: [...packageMap.values()].sort(
      (left, right) => left.durationHours - right.durationHours,
    ),
    roomUsage: [...usageMap.values()].sort((left, right) =>
      left.roomNumber.localeCompare(right.roomNumber, undefined, {
        numeric: true,
      }),
    ),
    paymentMethods,
    vehicleTypes,
    activity: selectedAuditLogs.map((log) => {
      const details = detailsRecord(log.details);
      const entityId = log.entityId ? Number(log.entityId) : null;
      const activityRoomNumber =
        log.entityType === 'STAY' && entityId
          ? stayRoom.get(entityId)
          : log.entityType === 'ROOM' && entityId
            ? roomNumber.get(entityId)
            : undefined;
      return {
        id: log.id,
        createdAt: log.createdAt,
        staff: log.staff,
        action: log.action,
        roomNumber: activityRoomNumber ?? null,
        stayId: log.entityType === 'STAY' ? entityId : null,
        bookingId: log.entityType === 'BOOKING' ? entityId : null,
        storeSaleId: log.entityType === 'STORE_SALE' ? entityId : null,
        productId: log.entityType === 'PRODUCT' ? entityId : null,
        amountCentavos: numberDetail(details, 'amountCentavos'),
        previousValue: details.previousValue ?? null,
        newValue: details.newValue ?? details.operationalStatus ?? null,
        details,
      };
    }),
  };
}

export type OwnerReport = Awaited<ReturnType<typeof buildOwnerReport>>;
