import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck2, FilePlus2, FileText, Hourglass, TrendingUp, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DailyColumns, HBars } from "../components/charts";
import { Amount, ErrorNote, StatusBadge } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtRelativeDay, greeting, rupees, rupeesShort } from "../lib/format";
import type { Dashboard, InvoiceSummary } from "../lib/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/reports/dashboard/"), refetchInterval: 60_000 });
  const d = q.data;
  const firstName = user?.role === "DOCTOR" ? `Dr. ${user.first_name || user.display_name}` : user?.first_name || user?.display_name;

  return (
    <div>
      {/* Hero */}
      <section className="relative mb-6 overflow-hidden rounded-2xl bg-espresso px-6 py-7 text-on-espresso sm:px-8 sm:py-8">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "radial-gradient(50% 120% at 95% 0%, rgba(195,140,43,0.28) 0%, rgba(28,23,18,0) 60%)" }}
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[0.74rem] font-semibold uppercase tracking-[0.16em] text-gold-300">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <h1 className="mt-2 font-display text-[2.3rem] font-semibold leading-tight text-white">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-1 text-on-espresso-2">
              {d
                ? d.today.invoice_count
                  ? `${d.today.invoice_count} invoice${d.today.invoice_count > 1 ? "s" : ""} raised today for ${d.today.patients} patient${d.today.patients > 1 ? "s" : ""}.`
                  : "No invoices yet today. Ready when your first patient is."
                : "Loading today's summary…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/invoices/new" className="btn btn-gold btn-lg">
              <FilePlus2 size={19} aria-hidden /> New invoice
            </Link>
            {d && d.outstanding.count > 0 && (
              <Link to="/invoices?payment_status=DUE" className="btn btn-lg border border-on-espresso-2/30 text-on-espresso hover:bg-espresso-2">
                Collect dues
              </Link>
            )}
          </div>
        </div>
      </section>

      {q.isError && <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      {/* KPI tiles */}
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi icon={<Wallet size={19} />} label="Collected today" value={d && rupeesShort(d.today.collected)} note={d && Number(d.today.refunded) > 0 ? `after ${rupees(d.today.refunded)} refunded` : "net of refunds"} primary />
        <Kpi icon={<FileText size={19} />} label="Billed today" value={d && rupeesShort(d.today.billed)} note={d && `${d.today.invoice_count} invoice${d.today.invoice_count === 1 ? "" : "s"}`} />
        <Kpi
          icon={<Hourglass size={19} />}
          label="Pending dues"
          value={d && rupeesShort(d.outstanding.amount)}
          note={d && (d.outstanding.count ? `${d.outstanding.count} invoice${d.outstanding.count === 1 ? "" : "s"} unpaid` : "All invoices settled")}
          to="/invoices?payment_status=DUE"
        />
        <Kpi icon={<TrendingUp size={19} />} label={d ? `Collected in ${d.month.label}` : "This month"} value={d && rupeesShort(d.month.collected)} note="month to date" to="/reports" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="card card-pad" aria-labelledby="trend-h">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 id="trend-h" className="t-title">Daily collections</h2>
              <p className="text-[0.88rem] text-ink-3">Last 14 days, net of refunds</p>
            </div>
            <Link to="/reports" className="text-[0.88rem] font-medium text-gold-700 hover:underline">
              Full report
            </Link>
          </div>
          {d ? (
            <DailyColumns label="Daily collections over the last 14 days" data={d.trend.map((t) => ({ date: t.date, value: Number(t.collected) }))} />
          ) : (
            <div className="skeleton h-[220px] w-full" />
          )}
        </section>

        <section className="card card-pad" aria-labelledby="mode-h">
          <h2 id="mode-h" className="t-title">Today by payment mode</h2>
          <p className="mb-5 text-[0.88rem] text-ink-3">Money received today</p>
          {d ? (
            <HBars
              rows={d.today.by_mode.map((m) => ({ label: m.label, value: Number(m.amount) }))}
              empty="No payments received yet today."
            />
          ) : (
            <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-8" />)}</div>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <InvoiceListCard
          title="Recent invoices"
          icon={<CalendarCheck2 size={18} />}
          rows={d?.recent_invoices}
          link={{ to: "/invoices", label: "All invoices" }}
          empty="Invoices you create will show up here."
        />
        <InvoiceListCard
          title="Awaiting payment"
          icon={<Users size={18} />}
          rows={d?.pending_invoices}
          link={{ to: "/invoices?payment_status=DUE", label: "All dues" }}
          empty="Nothing pending. Every invoice is settled."
          showDue
        />
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, note, primary, to }: { icon: ReactNode; label: string; value?: string; note?: ReactNode; primary?: boolean; to?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[0.86rem] font-medium text-ink-2">{label}</span>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${primary ? "bg-gold-100 text-gold-800" : "bg-cream text-ink-2"}`} aria-hidden>
          {icon}
        </span>
      </div>
      {value !== undefined ? (
        <div className="t-num mt-3 font-display text-[2rem] font-semibold leading-none sm:text-[2.25rem]">{value}</div>
      ) : (
        <div className="skeleton mt-3 h-9 w-32" />
      )}
      <div className="mt-2 text-[0.82rem] text-ink-3">{note ?? " "}</div>
    </>
  );
  const cls = `card card-pad block ${primary ? "ring-1 ring-gold-300" : ""} ${to ? "transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]" : ""}`;
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function InvoiceListCard({
  title,
  icon,
  rows,
  link,
  empty,
  showDue,
}: {
  title: string;
  icon: ReactNode;
  rows?: InvoiceSummary[];
  link: { to: string; label: string };
  empty: string;
  showDue?: boolean;
}) {
  return (
    <section className="card" aria-label={title}>
      <div className="flex items-center justify-between px-6 pb-3 pt-5">
        <h2 className="t-title flex items-center gap-2.5">
          <span className="text-gold-700" aria-hidden>{icon}</span>
          {title}
        </h2>
        <Link to={link.to} className="inline-flex items-center gap-1 text-[0.88rem] font-medium text-gold-700 hover:underline">
          {link.label} <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
      {!rows ? (
        <div className="space-y-3 px-6 pb-6">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10" />)}</div>
      ) : rows.length === 0 ? (
        <p className="px-6 pb-6 text-[0.92rem] text-ink-3">{empty}</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((inv) => (
            <li key={inv.id}>
              <Link to={`/invoices/${inv.id}`} className="flex items-center gap-4 px-6 py-3 transition hover:bg-gold-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{inv.patient_name}</div>
                  <div className="truncate text-[0.82rem] text-ink-3">
                    {inv.number} · {fmtRelativeDay(inv.invoice_date)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {showDue ? (
                    <>
                      <Amount value={inv.balance_due} className="font-semibold text-danger" />
                      <span className="text-[0.76rem] text-ink-3">of {rupees(inv.total)}</span>
                    </>
                  ) : (
                    <>
                      <Amount value={inv.total} className="font-semibold" />
                      <StatusBadge status={inv.payment_status} size="sm" />
                    </>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
