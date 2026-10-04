"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

/* evilcharts 风格：渐变填充 + 圆角柱 + 暗色网格，手实现（recharts 引擎） */

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(222 44% 8% / 0.95)",
  border: "1px solid hsl(217 28% 22%)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "hsl(213 31% 91%)",
  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.6)",
};

export function MonthlyOrdersChart({ data }: { data: { month: string; orders: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke="hsl(217 28% 18%)" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "hsl(217 12% 62%)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "hsl(217 12% 62%)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(187 92% 50% / 0.06)" }} />
        <Bar dataKey="orders" name="订单数" fill="url(#barGrad)" radius={[6, 6, 2, 2]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const STATUS_COLORS: Record<string, string> = {
  SHIPPED: "#34d399", PRODUCING: "#38bdf8", READY: "#a78bfa", PARTIALLY_SHIPPED: "#2dd4bf",
  CONFIRMED: "#818cf8", PENDING: "#fbbf24", DRAFT: "#64748b", CANCELLED: "#f87171",
  COMPLETED: "#10b981", PARTIALLY_PAID: "#22d3ee", MODIFYING: "#fb923c", REJECTED: "#ef4444",
};

export function StatusDonut({ data, labels }: { data: { status: string; value: number }[]; labels: Record<string, string> }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="status" innerRadius={58} outerRadius={82} paddingAngle={3} strokeWidth={0}
          label={({ payload }: any) => `${labels[payload.status] ?? payload.status} ${payload.value}`}
          labelLine={false} fontSize={11}>
          {data.map((d) => <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? "#64748b"} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, n: any) => [v, labels[n] ?? n]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function QtyTrendChart({ data }: { data: { month: string; qty: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke="hsl(217 28% 18%)" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "hsl(217 12% 62%)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "hsl(217 12% 62%)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Area type="monotone" dataKey="qty" name="件数" stroke="#c4b5fd" strokeWidth={2} fill="url(#areaGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
