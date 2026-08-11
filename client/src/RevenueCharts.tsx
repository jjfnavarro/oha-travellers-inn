import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface RevenueTrendPoint {
  key: string;
  label: string;
  roomRevenueCentavos: number;
  extensionRevenueCentavos: number;
  storeRevenueCentavos: number;
  extraChargesRevenueCentavos: number;
  totalRevenueCentavos: number;
}

export interface RevenueBreakdownItem {
  name: string;
  amountCentavos: number;
  color: string;
}

const money = (centavos: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(centavos / 100);

const compactMoney = (centavos: number) => {
  const pesos = centavos / 100;
  if (pesos >= 1_000_000) return `₱${(pesos / 1_000_000).toFixed(1)}M`;
  if (pesos >= 1_000) return `₱${(pesos / 1_000).toFixed(0)}K`;
  return `₱${pesos.toFixed(0)}`;
};

export function RevenueCharts({
  trend,
  breakdown,
}: {
  trend: RevenueTrendPoint[];
  breakdown: RevenueBreakdownItem[];
}) {
  return (
    <div className="revenue-chart-grid">
      <section className="revenue-chart-panel">
        <h3>Revenue trend</h3>
        <div
          className="revenue-chart-canvas"
          role="img"
          aria-label="Revenue over the selected reporting period"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trend}
              margin={{ top: 8, right: 14, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="#dddddd" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                minTickGap={24}
                tick={{ fill: '#555555', fontSize: 11 }}
              />
              <YAxis
                width={54}
                tickFormatter={compactMoney}
                tick={{ fill: '#555555', fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [money(Number(value)), 'Revenue']}
                labelStyle={{ color: '#1c1c1c' }}
              />
              <Line
                type="monotone"
                dataKey="totalRevenueCentavos"
                stroke="#1c1c1c"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, fill: '#18823b' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="revenue-chart-panel">
        <h3>Revenue breakdown</h3>
        <div
          className="revenue-chart-canvas"
          role="img"
          aria-label="Revenue by source"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={breakdown}
              layout="vertical"
              margin={{ top: 8, right: 22, left: 8, bottom: 4 }}
            >
              <CartesianGrid stroke="#dddddd" strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickFormatter={compactMoney}
                tick={{ fill: '#555555', fontSize: 11 }}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={92}
                tick={{ fill: '#333333', fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [money(Number(value)), 'Revenue']}
                labelStyle={{ color: '#1c1c1c' }}
              />
              <Bar
                dataKey="amountCentavos"
                radius={[0, 3, 3, 0]}
                isAnimationActive={false}
              >
                {breakdown.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
