import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, FilePlus2, FileText } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useDebounced } from "../components/Combobox";
import { DateRangeFilter, Pagination, SearchInput, useUrlState } from "../components/filters";
import { Amount, EmptyState, ErrorNote, PageHeader, SkeletonRows, StatusBadge } from "../components/ui";
import { api, qs } from "../lib/api";
import { fmtDate, fmtTime } from "../lib/format";
import type { InvoiceSummary, Paginated } from "../lib/types";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "DUE", label: "Balance due" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL", label: "Partially paid" },
  { value: "PENDING", label: "Payment pending" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [f, setF] = useUrlState({ q: "", payment_status: "", from: "", to: "", page: "1" });
  const q = useDebounced(f.q);
  const page = Number(f.page) || 1;
  const list = useQuery({
    queryKey: ["invoices", q, f.payment_status, f.from, f.to, page],
    queryFn: () => api<Paginated<InvoiceSummary>>(`/invoices/${qs({ q, payment_status: f.payment_status, from: f.from, to: f.to, page })}`),
    placeholderData: keepPreviousData,
  });
  const filtered = Boolean(f.q || f.payment_status || f.from || f.to);

  return (
    <div>
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        subtitle="Every bill raised at the clinic. Open one to print, collect payment or refund."
        actions={
          <Link to="/invoices/new" className="btn btn-primary">
            <FilePlus2 size={17} aria-hidden /> New invoice
          </Link>
        }
      />

      <div className="card">
        <div className="flex flex-col gap-4 border-b border-line p-5 xl:flex-row xl:items-end">
          <SearchInput label="Search" placeholder="Patient name, mobile, patient ID or invoice number" value={f.q} onChange={(v) => setF({ q: v })} />
          <div>
            <label htmlFor="status-filter" className="field-label">
              Status
            </label>
            <select id="status-filter" className="input xl:!w-44" value={f.payment_status} onChange={(e) => setF({ payment_status: e.target.value })}>
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
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
          filtered ? (
            <EmptyState icon={<FileText size={24} />} title="No invoices match these filters">
              Try a different name or number, or clear the filters.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<FileText size={24} />}
              title="No invoices yet"
              action={
                <Link to="/invoices/new" className="btn btn-gold">
                  <FilePlus2 size={17} aria-hidden /> Create the first invoice
                </Link>
              }
            >
              Invoices you create will appear here.
            </EmptyState>
          )
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="table">
                <caption className="sr-only">Invoices</caption>
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Patient</th>
                    <th scope="col" className="hidden lg:table-cell">Items</th>
                    <th scope="col" className="!text-right">Total</th>
                    <th scope="col" className="!text-right">Balance</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.results.map((inv) => (
                    <tr key={inv.id} className="row-link" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      <td>
                        <Link to={`/invoices/${inv.id}`} className="font-semibold hover:text-gold-700" onClick={(e) => e.stopPropagation()}>
                          {inv.number}
                        </Link>
                        <div className="text-[0.82rem] text-ink-3">
                          {fmtDate(inv.invoice_date)} · {fmtTime(inv.invoice_date)}
                        </div>
                      </td>
                      <td>
                        <div className="font-medium">{inv.patient_name}</div>
                        <div className="text-[0.82rem] text-ink-3">
                          {inv.patient_uhid} · {inv.patient_phone}
                        </div>
                      </td>
                      <td className="hidden max-w-[16rem] truncate text-ink-2 lg:table-cell">{inv.item_summary}</td>
                      <td className="text-right font-semibold">
                        <Amount value={inv.total} />
                      </td>
                      <td className="text-right">
                        {Number(inv.balance_due) > 0 ? <Amount value={inv.balance_due} className="font-semibold text-danger" /> : <span className="text-ink-3">—</span>}
                      </td>
                      <td>
                        <StatusBadge status={inv.payment_status} size="sm" />
                      </td>
                      <td className="w-8 text-ink-3">
                        <ChevronRight size={18} aria-hidden />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <ul className="divide-y divide-line md:hidden">
              {list.data.results.map((inv) => (
                <li key={inv.id}>
                  <Link to={`/invoices/${inv.id}`} className="block px-4 py-4 active:bg-gold-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{inv.patient_name}</div>
                        <div className="text-[0.82rem] text-ink-3">
                          {inv.number} · {fmtDate(inv.invoice_date)}
                        </div>
                      </div>
                      <Amount value={inv.total} className="font-semibold" />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <StatusBadge status={inv.payment_status} size="sm" />
                      {Number(inv.balance_due) > 0 && (
                        <span className="text-[0.84rem] font-medium text-danger">
                          Due <Amount value={inv.balance_due} />
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={page} count={list.data.count} onPage={(p) => setF({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
