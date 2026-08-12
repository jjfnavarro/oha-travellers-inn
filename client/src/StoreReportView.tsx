import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { apiRequest, apiUrl } from './api';
import type { RevenueTrendPoint } from './RevenueCharts';

const RevenueCharts = lazy(() =>
  import('./RevenueCharts').then((module) => ({
    default: module.RevenueCharts,
  })),
);

type Preset =
  | 'current_shift'
  | 'previous_shift'
  | 'today'
  | 'specific_date'
  | 'week'
  | 'month'
  | 'custom';
type Shift = 'ALL' | 'DAY' | 'NIGHT';

interface StaffRecord {
  id: number;
  username: string;
  role: 'OWNER' | 'FRONT_DESK';
  isActive: boolean;
}
interface StoreReport {
  selectedStaff: StaffRecord | null;
  filters: { label: string; shift: Shift };
  summary: {
    storeRevenueCentavos: number;
    extraChargesRevenueCentavos: number;
    totalRevenueCentavos: number;
    salesCount: number;
    itemsSold: number;
  };
  revenueTrend: RevenueTrendPoint[];
  paymentMethods: {
    method: 'CASH' | 'GCASH';
    count: number;
    amountCentavos: number;
  }[];
  products: {
    productId: number;
    name: string;
    category: 'STORE_PRODUCT' | 'EXTRA_CHARGE';
    quantity: number;
    salesCount: number;
    revenueCentavos: number;
  }[];
  staff: {
    staffId: number;
    username: string;
    salesCount: number;
    storeRevenueCentavos: number;
    extraChargesRevenueCentavos: number;
    totalRevenueCentavos: number;
  }[];
  activity: {
    id: number;
    createdAt: string;
    staff: { id: number; username: string };
    stayId: number | null;
    roomNumber: string | null;
    paymentMethod: 'CASH' | 'GCASH';
    totalAmountCentavos: number;
    items: {
      name: string;
      category: 'STORE_PRODUCT' | 'EXTRA_CHARGE';
      unitPriceCentavos: number;
      quantity: number;
      lineTotalCentavos: number;
    }[];
  }[];
}

const money = (centavos: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(centavos / 100);
const dateTime = (value: string) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
const currentDate = () => {
  const operationalNow = new Date(Date.now() - 8 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(operationalNow);
};

export function StoreReportView({
  embeddedQuery,
}: {
  embeddedQuery?: string;
} = {}) {
  const [preset, setPreset] = useState<Preset>('today');
  const [shift, setShift] = useState<Shift>('ALL');
  const [date, setDate] = useState(currentDate);
  const [from, setFrom] = useState(currentDate);
  const [to, setTo] = useState(currentDate);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [staffId, setStaffId] = useState('');
  const [byStaff, setByStaff] = useState(false);
  const [report, setReport] = useState<StoreReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadRequest, setReloadRequest] = useState(0);

  useEffect(() => {
    if (embeddedQuery !== undefined) return;
    apiRequest<{ data: StaffRecord[] }>('/staff')
      .then((response) => {
        const active = response.data.filter((item) => item.isActive);
        setStaff(active);
        setStaffId(String(active[0]?.id ?? ''));
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : 'Staff could not be loaded.',
        ),
      );
  }, [embeddedQuery]);

  const query = useMemo(() => {
    const parameters = new URLSearchParams({ preset, shift });
    if (['specific_date', 'week', 'month'].includes(preset))
      parameters.set('date', date);
    if (preset === 'custom') {
      parameters.set('from', from);
      parameters.set('to', to);
    }
    if (byStaff && staffId) parameters.set('staffId', staffId);
    return parameters.toString();
  }, [byStaff, date, from, preset, shift, staffId, to]);
  const effectiveQuery = embeddedQuery ?? query;
  const requiresStaff =
    embeddedQuery === undefined && byStaff && staffId.length === 0;

  useEffect(() => {
    if (requiresStaff) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setMessage(null);
    apiRequest<{ data: StoreReport }>(`/reports/store?${effectiveQuery}`)
      .then((response) => {
        if (!active) return;
        setReport(response.data);
        setMessage(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(
          error instanceof Error
            ? error.message
            : 'Store report could not be loaded.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [effectiveQuery, reloadRequest, requiresStaff]);

  useEffect(() => {
    const refresh = () => setReloadRequest((value) => value + 1);
    window.addEventListener('oha:reconnected', refresh);
    return () => window.removeEventListener('oha:reconnected', refresh);
  }, []);

  return (
    <section
      className={
        embeddedQuery === undefined
          ? 'print-report store-report-view'
          : 'store-report-view embedded-store-report'
      }
    >
      {embeddedQuery === undefined && (
        <div className="page-heading">
          <div>
            <h2>Store reports</h2>
            <p>
              {report
                ? `${report.filters.label} · ${report.selectedStaff?.username ?? 'All staff'}`
                : 'Store and extra-charge revenue'}
            </p>
          </div>
          <div className="export-actions">
            <button className="secondary-button" onClick={() => window.print()}>
              Print
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                window.location.href = `${apiUrl}/reports/store/pdf?${query}`;
              }}
            >
              PDF
            </button>
            <button
              className="primary-button"
              onClick={() => {
                window.location.href = `${apiUrl}/reports/store/xlsx?${query}`;
              }}
            >
              Excel
            </button>
          </div>
        </div>
      )}
      {embeddedQuery === undefined && (
        <div className="report-controls owner-report-controls">
          <label>
            Reporting period
            <select
              value={preset}
              onChange={(event) => setPreset(event.target.value as Preset)}
            >
              <option value="current_shift">Current shift</option>
              <option value="previous_shift">Previous shift</option>
              <option value="today">Today</option>
              <option value="specific_date">Specific date</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="custom">Custom date range</option>
            </select>
          </label>
          {['specific_date', 'week', 'month'].includes(preset) && (
            <label>
              Reference date
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          )}
          {preset === 'custom' && (
            <>
              <label>
                From
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  min={from}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </>
          )}
          <label>
            Shift
            <select
              value={shift}
              onChange={(event) => setShift(event.target.value as Shift)}
            >
              <option value="ALL">All shifts</option>
              <option value="DAY">Day shift</option>
              <option value="NIGHT">Night shift</option>
            </select>
          </label>
          <fieldset className="period-control report-view-control">
            <legend>View</legend>
            <div>
              <button
                type="button"
                className={!byStaff ? 'active' : ''}
                onClick={() => setByStaff(false)}
              >
                Overall
              </button>
              <button
                type="button"
                className={byStaff ? 'active' : ''}
                onClick={() => setByStaff(true)}
              >
                By staff
              </button>
            </div>
          </fieldset>
          {byStaff && (
            <label>
              Staff account
              <select
                value={staffId}
                onChange={(event) => setStaffId(event.target.value)}
              >
                {staff.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.username}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {message && (
        <div className="report-load-error" role="alert">
          <p className="form-error">{message}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setReloadRequest((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {loading ? (
        <p className="empty-state">Loading store report...</p>
      ) : !report ? (
        <p className="empty-state">Store report unavailable.</p>
      ) : (
        <>
          <div className="metric-grid store-metric-grid">
            <div>
              <span>Store revenue</span>
              <strong>{money(report.summary.storeRevenueCentavos)}</strong>
            </div>
            <div>
              <span>Extra charges</span>
              <strong>
                {money(report.summary.extraChargesRevenueCentavos)}
              </strong>
            </div>
            <div>
              <span>Combined revenue</span>
              <strong>{money(report.summary.totalRevenueCentavos)}</strong>
            </div>
            <div>
              <span>Items sold</span>
              <strong>{report.summary.itemsSold}</strong>
            </div>
          </div>
          <Suspense fallback={<div className="revenue-chart-loading" />}>
            <RevenueCharts
              trend={report.revenueTrend}
              breakdown={[
                {
                  name: 'Store',
                  amountCentavos: report.summary.storeRevenueCentavos,
                  color: '#18823b',
                },
                {
                  name: 'Extras',
                  amountCentavos: report.summary.extraChargesRevenueCentavos,
                  color: '#a05a2c',
                },
              ]}
            />
          </Suspense>
          <div className="report-breakdown-grid">
            <ReportTable
              title="Payment methods"
              headers={['Method', 'Sales', 'Collected']}
              rows={report.paymentMethods.map((item) => [
                item.method === 'GCASH' ? 'GCash' : 'Cash',
                item.count,
                money(item.amountCentavos),
              ])}
            />
            <ReportTable
              title="Per-staff store sales"
              headers={['Staff', 'Sales', 'Revenue']}
              rows={report.staff.map((item) => [
                item.username,
                item.salesCount,
                money(item.totalRevenueCentavos),
              ])}
              empty="No staff sales for this period."
            />
          </div>
          <ReportTable
            title="Product sales"
            headers={['Product', 'Category', 'Quantity', 'Revenue']}
            rows={report.products.map((item) => [
              item.name,
              item.category === 'STORE_PRODUCT'
                ? 'Store product'
                : 'Extra charge',
              item.quantity,
              money(item.revenueCentavos),
            ])}
            empty="No products sold for this period."
          />
          <h3>Detailed store activity</h3>
          {report.activity.length === 0 ? (
            <p className="empty-state">No store activity for this period.</p>
          ) : (
            <div className="store-activity-list">
              {report.activity.map((sale) => (
                <article key={sale.id}>
                  <div>
                    <strong>
                      {sale.items
                        .map((item) => `${item.quantity} × ${item.name}`)
                        .join(', ')}
                    </strong>
                    <span>
                      {dateTime(sale.createdAt)} · {sale.staff.username}
                    </span>
                    <small>
                      {sale.roomNumber
                        ? `Room ${sale.roomNumber}`
                        : 'Front desk'}{' '}
                      · {sale.paymentMethod === 'GCASH' ? 'GCash' : 'Cash'}
                    </small>
                  </div>
                  <b>{money(sale.totalAmountCentavos)}</b>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ReportTable({
  title,
  headers,
  rows,
  empty = 'No data for this period.',
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  empty?: string;
}) {
  return (
    <section>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="empty-state">{empty}</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table compact-report-table">
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {row.map((value, cell) => (
                    <td key={`${index}-${cell}`}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
