"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/dates";

// Validated categorical slots 1 & 2 (blue / orange), stepped per mode.
const COLORS = { light: { revenue: "#2a78d6", expenses: "#eb6834" }, dark: { revenue: "#3987e5", expenses: "#d95926" } };

export function TrendChart({ data }: { data: { month: string; revenue: number; expenses: number; profit: number }[] }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const c = COLORS[mounted && resolvedTheme === "dark" ? "dark" : "light"];
  const rows = data.map((d) => ({ ...d, label: fmtDate(d.month, "MMM") }));
  const empty = data.every((d) => d.revenue === 0 && d.expenses === 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: c.revenue }} /> Revenue (net)</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: c.expenses }} /> Operating expenses</span>
      </div>
      <div className="relative h-48">
        {empty && <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-subtle">No invoices or expenses recorded yet</div>}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--fg-subtle)", fontSize: 11 }} />
            <YAxis domain={[0, (max: number) => Math.max(max, 100000)]} tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--fg-subtle)", fontSize: 11 }} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]!.payload as (typeof rows)[number];
                return (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop">
                    <div className="mb-1 font-medium">{fmtDate(d.month, "MMMM yyyy")}</div>
                    <Row color={c.revenue} label="Revenue" v={d.revenue} />
                    <Row color={c.expenses} label="Expenses" v={d.expenses} />
                    <div className="mt-1 flex justify-between gap-6 border-t border-border pt-1 text-fg">
                      <span>Operating profit</span>
                      <span className="tabular font-medium">{formatMoney(d.profit)}</span>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="revenue" fill={c.revenue} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expenses" fill={c.expenses} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none text-subtle hover:text-muted">View as table</summary>
        <table className="mt-2 w-full tabular">
          <thead><tr className="text-subtle"><th className="text-left font-normal">Month</th><th className="text-right font-normal">Revenue</th><th className="text-right font-normal">Expenses</th><th className="text-right font-normal">Profit</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.month}><td>{fmtDate(r.month, "MMM yyyy")}</td><td className="text-right">{formatMoney(r.revenue)}</td><td className="text-right">{formatMoney(r.expenses)}</td><td className="text-right">{formatMoney(r.profit)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

function Row({ color, label, v }: { color: string; label: string; v: number }) {
  return (
    <div className="flex justify-between gap-6 text-muted">
      <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: color }} />{label}</span>
      <span className="tabular text-fg">{formatMoney(v)}</span>
    </div>
  );
}
