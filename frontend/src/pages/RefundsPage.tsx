import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { useDebounced } from "../components/Combobox";
import { DateRangeFilter, Pagination, SearchInput, useUrlState } from "../components/filters";
import { Amount, EmptyState, ErrorNote, PageHeader, Pill, SkeletonRows } from "../components/ui";
import { api, qs } from "../lib/api";
import { fmtDate, fmtTime } from "../lib/format";
import type { Paginated, Refund } from "../lib/types";

export default function RefundsPage() {
  const [f, setF] = useUrlState({ q: "", from: "", to: "", page: "1" });
  const q = useDebounced(f.q);
  const page = Number(f.page) || 1;
  const list = useQuery({
    queryKey: ["refunds", q, f.from, f.to, page],
    queryFn: () => api<Paginated<Refund>>(`/refunds/${qs({ search: q, from: f.from, to: f.to, page })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Billing"
        title="Refunds"
        subtitle="Money returned to patients. To issue a refund, open the invoice and choose Refund payment."
      />
      <div className="card">
        <div className="flex flex-col gap-4 border-b border-line p-5 xl:flex-row xl:items-end">
          <SearchInput label="Search" placeholder="Patient, refund no., invoice no. or reference" value={f.q} onChange={(v) => setF({ q: v })} />
          <DateRangeFilter value={{ from: f.from, to: f.to }} onChange={(r) => setF(r)} />
        </div>
        {list.isError ? (
          <div className="p-5">
            <ErrorNote message={(list.error as Error).message} onRetry={() => list.refetch()} />
          </div>
        ) : list.isLoading ? (
          <SkeletonRows />
        ) : !list.data?.results.length ? (
          <EmptyState icon={<RotateCcw size={24} />} title="No refunds">
            Refunds you record from an invoice will be listed here.
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {list.data.results.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
                  <div className="sm:w-40">
                    <div className="font-medium">{fmtDate(r.refunded_at)}</div>
                    <div className="text-[0.82rem] text-ink-3">
                      {fmtTime(r.refunded_at)} · {r.refund_number}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {r.patient_name}{" "}
                      <span className="font-normal text-ink-3">
                        · <Link to={`/invoices/${r.invoice}`} className="text-gold-700 hover:underline">{r.invoice_number}</Link>
                      </span>
                    </div>
                    <div className="text-[0.88rem] text-ink-2">“{r.reason}”</div>
                    <div className="text-[0.8rem] text-ink-3">
                      {r.created_by_name && `By ${r.created_by_name}`}
                      {r.reference && ` · Ref ${r.reference}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <Amount value={r.amount} className="text-[1.05rem] font-semibold" />
                    <Pill tone="info">{r.mode_label}</Pill>
                  </div>
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
