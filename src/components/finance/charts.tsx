"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { Table2, BarChart3 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";

// Categorical slots 1–3 of the validated reference palette (light + dark steps).
// Light slot 3 is < 3:1 on the surface → every chart here offers a table view.
const VIZ_STYLE = `
.viz-root { --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a; --viz-grid: var(--border); --viz-axis: var(--fg-subtle); }
.dark .viz-root { --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70; }
`;

export type MonthDatum = { month: string; revenueNet: number; expenseCost: number; operatingProfit: number; videos: number };

const monthLabel = (m: string) => fmtDate(`${m}-01`, "MMM");
const monthLong = (m: string) => fmtDate(`${m}-01`, "MMMM yyyy");
const euroTick = (v: number) => {
  const e = v / 100;
  if (Math.abs(e) >= 1000) return `€${Math.round(e / 100) / 10}k`;
  return `€${Math.round(e)}`;
};

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string; line?: boolean }[] }) {
  return (
    <div className="min-w-44 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      <div className="mb-1.5 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted">
            {r.color && <span className={r.line ? "h-0.5 w-3 rounded-full" : "size-2 rounded-sm"} style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tabular text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={i.line ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-sm"} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function ViewToggle({ table, setTable }: { table: boolean; setTable: (v: boolean) => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={() => setTable(!table)} aria-pressed={table}>
      {table ? <BarChart3 /> : <Table2 />} {table ? "Chart" : "Table"}
    </Button>
  );
}

export function MoneyTrendChart({ data }: { data: MonthDatum[] }) {
  const [table, setTable] = React.useState(false);
  const hi = Math.max(0, ...data.flatMap((d) => [d.revenueNet, d.expenseCost, d.operatingProfit]));
  const lo = Math.min(0, ...data.map((d) => d.operatingProfit));
  const pad = (hi - lo) * 0.08 || 10000;
  const domain: [number, number] = [lo < 0 ? lo - pad : 0, hi + pad];
  const items = [
    { label: "Revenue (ex VAT)", color: "var(--series-1)" },
    { label: "Expenses (business cost)", color: "var(--series-2)" },
    { label: "Operating profit", color: "var(--series-3)", line: true },
  ];
  return (
    <div className="viz-root">
      <style>{VIZ_STYLE}</style>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Legend items={items} />
        <ViewToggle table={table} setTable={setTable} />
      </div>
      {table ? (
        <MonthTable data={data} />
      ) : (
        <div className="h-64" role="img" aria-label="Monthly revenue, expenses and operating profit">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={{ fill: "var(--viz-axis)", fontSize: 11 }} />
              <YAxis domain={domain} allowDataOverflow={false} tickFormatter={euroTick} tickLine={false} axisLine={false} width={56} tick={{ fill: "var(--viz-axis)", fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={(p: TooltipContentProps<any, any>) => {
                  if (!p.active || !p.payload?.length) return null;
                  const d = p.payload[0]!.payload as MonthDatum;
                  return (
                    <TooltipBox
                      title={monthLong(d.month)}
                      rows={[
                        { label: "Revenue", value: formatMoney(d.revenueNet), color: "var(--series-1)" },
                        { label: "Expenses", value: formatMoney(d.expenseCost), color: "var(--series-2)" },
                        { label: "Profit", value: formatMoney(d.operatingProfit), color: "var(--series-3)", line: true },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="revenueNet" name="Revenue" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="expenseCost" name="Expenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Line
                dataKey="operatingProfit"
                name="Profit"
                stroke="var(--series-3)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--series-3)", stroke: "var(--surface)", strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function MonthTable({ data }: { data: MonthDatum[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="py-2 text-left font-medium">Month</th>
            <th className="py-2 text-right font-medium">Revenue</th>
            <th className="py-2 text-right font-medium">Expenses</th>
            <th className="py-2 text-right font-medium">Profit</th>
            <th className="py-2 text-right font-medium">Videos</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month} className="border-b border-border last:border-0">
              <td className="py-1.5">{monthLong(d.month)}</td>
              <td className="tabular py-1.5 text-right">{formatMoney(d.revenueNet)}</td>
              <td className="tabular py-1.5 text-right">{formatMoney(d.expenseCost)}</td>
              <td className="tabular py-1.5 text-right">{formatMoney(d.operatingProfit)}</td>
              <td className="tabular py-1.5 text-right">{d.videos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VideosChart({ data }: { data: MonthDatum[] }) {
  const [table, setTable] = React.useState(false);
  return (
    <div className="viz-root">
      <style>{VIZ_STYLE}</style>
      <div className="mb-2 flex justify-end">
        <ViewToggle table={table} setTable={setTable} />
      </div>
      {table ? (
        <MonthTable data={data} />
      ) : (
        <div className="h-44" role="img" aria-label="Videos delivered per month">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={{ fill: "var(--viz-axis)", fontSize: 11 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fill: "var(--viz-axis)", fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={(p: TooltipContentProps<any, any>) => {
                  if (!p.active || !p.payload?.length) return null;
                  const d = p.payload[0]!.payload as MonthDatum;
                  return <TooltipBox title={monthLong(d.month)} rows={[{ label: "Delivered", value: String(d.videos), color: "var(--series-1)" }]} />;
                }}
              />
              <Bar dataKey="videos" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
