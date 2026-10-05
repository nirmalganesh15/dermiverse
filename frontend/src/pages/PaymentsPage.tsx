import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Receipt, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useDebounced } from "../components/Combobox";
import { DateRangeFilter, Pagination, SearchInput, useUrlState } from "../components/filters";
import { Amount, EmptyState, ErrorNote, PageHeader, Pill, SkeletonRows } from "../components/ui";
import { api, openPdf, qs } from "../lib/api";
import { fmtDate, fmtTime, PAYMENT_MODES, rupees } from "../lib/format";
import type { Paginated, Payment } from "../lib/types";

export default function PaymentsPage() {
  const [f, setF] = useUrlState({ q: "", mode: "", from: "", to: "", page: "1" });
  const q = useDebounced(f.q);
  const page = Number(f.page) || 1;
  const list = useQuery({
    queryKey: ["payments", q, f.mode, f.from, f.to, page],
    queryFn: () => api<Paginated<Payment>>(`/payments/${qs({ search: q, mode: f.mode, from: f.from, to: f.to, page })}`),
    placeholderData: keepPreviousData,
  });
  const pageTotal = (list.data?.results ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const receipt = (p: Payment) =>
    openPdf(`/payments/${p.id}/pdf/`, "view", `${p.receipt_number}.pdf`).catch((e) => toast.error((e as Error).message));

  return (
    <div>
      <PageHeader eyebrow="Billing" title="Payments" subtitle="Every payment received, with its receipt." />
      <div className="card">
        <div className="flex flex-col gap-4 border-b border-line p-5 xl:flex-row xl:items-end">
          <SearchInput label="Search" placeholder="Patient, receipt no., invoice no. or reference" value={f.q} onChange={(v) => setF({ q: v })} />
          <div>
            <label htmlFor="mode-filter" className="field-label">
              Paid by
            </label>
            <select id="mode-filter" className="input xl:!w-40" value={f.mode} onChange={(e) => setF({ mode: e.target.value })}>
              <option value="">All modes</option>
              {PAYMENT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <DateRangeFilter value={{ from: f.from, to: f.to }} onChange={(r) => setF(r)} />
        </div>

        {list.isError ? (
          <div className="p-5">
            <ErrorNote message={(list.error as Error).message} onRetry={() => list.refetch()} />
          </div>
        ) : list.isLoading ? (
          <SkeletonRows />
        ) : !list.data?.results.length ? (
          <EmptyState icon={<Wallet size={24} />} title="No payments found">
            Payments are recorded when you create an invoice or receive a balance.
          </EmptyState>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="table">
                <caption className="sr-only">Payments</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Patient</th>
                    <th scope="col">Invoice</th>
                    <th scope="col">Mode</th>
                    <th scope="col" className="hidden lg:table-cell">Reference</th>
                    <th scope="col" className="!text-right">Amount</th>
                    <th scope="col"><span className="sr-only">Receipt</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.results.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="font-medium">{fmtDate(p.paid_at)}</div>
                        <div className="text-[0.82rem] text-ink-3">
                          {fmtTime(p.paid_at)} · {p.receipt_number}
                        </div>
                      </td>
                      <td>
                        <div className="font-medium">{p.patient_name}</div>
                        <div className="text-[0.82rem] text-ink-3">{p.patient_uhid}</div>
                      </td>
                      <td>
                        <Link to={`/invoices/${p.invoice}`} className="font-medium text-gold-700 hover:underline">
                          {p.invoice_number}
                        </Link>
                      </td>
                      <td>
                        <Pill>{p.mode_label}</Pill>
                      </td>
                      <td className="hidden text-ink-2 lg:table-cell">{p.reference || "—"}</td>
                      <td className="text-right font-semibold">
                        <Amount value={p.amount} />
                      </td>
                      <td className="text-right">
                        <button className="btn btn-sm btn-ghost" onClick={() => receipt(p)}>
                          <Receipt size={15} aria-hidden /> Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {list.data.results.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.patient_name}</div>
                    <div className="text-[0.82rem] text-ink-3">
                      {fmtDate(p.paid_at)} · {p.mode_label} · {p.invoice_number}
                    </div>
                  </div>
                  <Amount value={p.amount} className="font-semibold" />
                  <button className="icon-btn" onClick={() => receipt(p)} aria-label={`Receipt ${p.receipt_number}`}>
                    <Receipt size={17} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end border-t border-line px-5 py-3 text-[0.9rem] text-ink-2">
              Total on this page:&nbsp;<strong className="t-num text-ink">{rupees(pageTotal)}</strong>
            </div>
            <Pagination page={page} count={list.data.count} onPage={(p) => setF({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
