import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DailyColumns, HBars } from "../components/charts";
import { DateRangeFilter, rangePresets, useUrlState } from "../components/filters";
import { Amount, ErrorNote, PageHeader, SkeletonRows } from "../components/ui";
import { api, qs } from "../lib/api";
import { fmtDate, plainNumber, rupees, rupeesShort } from "../lib/format";
import type { ReportSummary } from "../lib/types";

function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function ReportsPage() {
  const month = rangePresets().find((p) => p.key === "month")!.range;
  const [f, setF] = useUrlState({ from: month.from, to: month.to });
  const q = useQuery({
    queryKey: ["report", f.from, f.to],
    queryFn: () => api<ReportSummary>(`/reports/summary/${qs({ from: f.from, to: f.to })}`),
    placeholderData: keepPreviousData,
  });
  const r = q.data;
  const tag = `${f.from}_to_${f.to}`;

  return (
    <div>
      <PageHeader eyebrow="Billing" title="Reports" subtitle="Collections, services and dues for any period." />

      <div className="card card-pad mb-6">
        <DateRangeFilter value={{ from: f.from, to: f.to }} onChange={(v) => setF({ from: v.from || month.from, to: v.to || month.to })} allowAll={false} />
      </div>

      {q.isError && <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {!r ? (
        <div className="card"><SkeletonRows /></div>
      ) : (
        <div className={clsx("space-y-6 transition-opacity", q.isFetching && "opacity-60")}>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Tile label="Net collected" value={rupeesShort(r.totals.net_collected)} note={`${rupees(r.totals.collected)} received − ${rupees(r.totals.refunded)} refunded`} primary />
            <Tile label="Billed" value={rupeesShort(r.totals.billed)} note={`${r.totals.invoice_count} invoices · ${r.totals.patient_count} patients`} />
            <Tile label="Discounts given" value={rupeesShort(r.totals.discount)} note={r.totals.cancelled_count ? `${r.totals.cancelled_count} invoices cancelled` : "No cancellations"} />
            <Tile label="GST collected" value={rupeesShort(r.totals.tax)} note="CGST + SGST" />
          </div>

          {r.daily.length > 1 && (
            <section className="card card-pad" aria-labelledby="daily-h">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h2 id="daily-h" className="t-title">Daily collections</h2>
                  <p className="text-[0.88rem] text-ink-3">
                    {fmtDate(r.range.from)} – {fmtDate(r.range.to)}, net of refunds
                  </p>
                </div>
                <ExportButton
                  onClick={() =>
                    downloadCsv(`daily-collections_${tag}.csv`, ["Date", "Billed", "Collected (net)"], r.daily.map((d) => [d.date, d.billed, d.collected]))
                  }
                />
              </div>
              <DailyColumns label="Daily collections for the selected period" highlightLast={false} data={r.daily.map((d) => ({ date: d.date, value: Number(d.collected) }))} />
            </section>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <section className="card card-pad" aria-labelledby="mode-h">
              <div className="mb-5 flex items-center justify-between">
                <h2 id="mode-h" className="t-title">By payment mode</h2>
                <ExportButton
                  onClick={() =>
                    downloadCsv(`payment-modes_${tag}.csv`, ["Mode", "Payments", "Received", "Refunded"], r.by_mode.map((m) => [m.label, m.count, m.amount, m.refunded]))
                  }
                />
              </div>
              <HBars
                rows={r.by_mode.filter((m) => Number(m.amount) > 0).map((m) => ({ label: m.label, value: Number(m.amount), note: `· ${m.count}` }))}
                empty="No payments in this period."
              />
              {r.by_category.length > 0 && (
                <>
                  <h3 className="t-overline mb-3 mt-8">Billed by category</h3>
                  <HBars rows={r.by_category.map((c) => ({ label: c.label, value: Number(c.amount) }))} />
                </>
              )}
            </section>

            <section className="card" aria-labelledby="svc-h">
              <div className="flex items-center justify-between px-6 pb-3 pt-5">
                <h2 id="svc-h" className="t-title">Services & products</h2>
                <ExportButton
                  onClick={() =>
                    downloadCsv(
                      `services_${tag}.csv`,
                      ["Item", "Category", "Quantity", "Invoices", "Amount"],
                      r.by_service.map((s) => [s.description, s.category_label, s.quantity, s.invoices, s.amount]),
                    )
                  }
                />
              </div>
              {r.by_service.length === 0 ? (
                <p className="px-6 pb-6 text-ink-3">Nothing billed in this period.</p>
              ) : (
                <div className="max-h-[26rem] overflow-auto">
                  <table className="table">
                    <caption className="sr-only">Billed services and products</caption>
                    <thead className="sticky top-0">
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col" className="!text-right">Qty</th>
                        <th scope="col" className="!text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.by_service.map((s) => (
                        <tr key={s.description + s.category}>
                          <td>
                            <div className="font-medium">{s.description}</div>
                            <div className="text-[0.8rem] text-ink-3">{s.category_label}</div>
                          </td>
                          <td className="t-num text-right">{plainNumber(s.quantity)}</td>
                          <td className="text-right font-semibold">
                            <Amount value={s.amount} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="card" aria-labelledby="due-h">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
              <div>
                <h2 id="due-h" className="t-title">Outstanding dues</h2>
                <p className="text-[0.88rem] text-ink-3">All unpaid balances to date: {rupees(r.outstanding_total)}</p>
              </div>
              <ExportButton
                onClick={() =>
                  downloadCsv(
                    "outstanding-dues.csv",
                    ["Invoice", "Date", "Patient", "Patient ID", "Mobile", "Total", "Paid", "Balance"],
                    r.outstanding.map((i) => [i.number, i.invoice_date.slice(0, 10), i.patient_name, i.patient_uhid, i.patient_phone, i.total, i.amount_paid, i.balance_due]),
                  )
                }
              />
            </div>
            {r.outstanding.length === 0 ? (
              <p className="px-6 pb-6 text-ink-3">No dues. Every invoice is fully paid.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {r.outstanding.map((i) => (
                  <li key={i.id}>
                    <Link to={`/invoices/${i.id}`} className="flex items-center gap-4 px-6 py-3 hover:bg-gold-50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{i.patient_name}</div>
                        <div className="text-[0.82rem] text-ink-3">
                          {i.number} · {fmtDate(i.invoice_date)} · {i.patient_phone}
                        </div>
                      </div>
                      <div className="text-right">
                        <Amount value={i.balance_due} className="font-semibold text-danger" />
                        <div className="text-[0.76rem] text-ink-3">of {rupees(i.total)}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, note, primary }: { label: string; value: string; note: ReactNode; primary?: boolean }) {
  return (
    <div className={clsx("card card-pad", primary && "ring-1 ring-gold-300")}>
      <div className="text-[0.86rem] font-medium text-ink-2">{label}</div>
      <div className="t-num mt-2 font-display text-[2rem] font-semibold leading-none">{value}</div>
      <div className="mt-2 text-[0.8rem] text-ink-3">{note}</div>
    </div>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn btn-sm btn-ghost" onClick={onClick}>
      <Download size={15} aria-hidden /> Export CSV
    </button>
  );
}
