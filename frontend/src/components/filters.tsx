import { endOfMonth, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { isoDate } from "../lib/format";

export type Range = { from: string; to: string };

export function rangePresets(): { key: string; label: string; range: Range }[] {
  const today = new Date();
  return [
    { key: "today", label: "Today", range: { from: isoDate(today), to: isoDate(today) } },
    { key: "yesterday", label: "Yesterday", range: { from: isoDate(subDays(today, 1)), to: isoDate(subDays(today, 1)) } },
    { key: "week", label: "This week", range: { from: isoDate(startOfWeek(today, { weekStartsOn: 1 })), to: isoDate(today) } },
    { key: "month", label: "This month", range: { from: isoDate(startOfMonth(today)), to: isoDate(today) } },
    {
      key: "lastmonth",
      label: "Last month",
      range: { from: isoDate(startOfMonth(subMonths(today, 1))), to: isoDate(endOfMonth(subMonths(today, 1))) },
    },
  ];
}

/** URL-backed filter state so filters survive refresh and can be shared/bookmarked. */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const state = Object.fromEntries(Object.keys(defaults).map((k) => [k, params.get(k) ?? defaults[k]])) as T;
  const set = (patch: Partial<T>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || v === defaults[k]) next.delete(k);
      else next.set(k, v as string);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };
  return [state, set] as const;
}

export function DateRangeFilter({
  value,
  onChange,
  allowAll = true,
}: {
  value: Range;
  onChange: (r: Range) => void;
  allowAll?: boolean;
}) {
  const presets = rangePresets();
  const current = presets.find((p) => p.range.from === value.from && p.range.to === value.to)?.key ?? (value.from || value.to ? "custom" : "all");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="range-preset" className="field-label">
          Period
        </label>
        <select
          id="range-preset"
          className="input !w-auto min-w-[9.5rem]"
          value={current}
          onChange={(e) => {
            const p = presets.find((x) => x.key === e.target.value);
            if (p) onChange(p.range);
            else if (e.target.value === "all") onChange({ from: "", to: "" });
          }}
        >
          {allowAll && <option value="all">All dates</option>}
          {presets.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value="custom" disabled={current !== "custom"}>
            Custom dates
          </option>
        </select>
      </div>
      <div>
        <label htmlFor="range-from" className="field-label">
          From
        </label>
        <input id="range-from" type="date" className="input !w-auto" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </div>
      <div>
        <label htmlFor="range-to" className="field-label">
          To
        </label>
        <input id="range-to" type="date" className="input !w-auto" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor="list-search" className="field-label">
        {label}
      </label>
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
        <input id="list-search" type="search" className="input !pl-10" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export function Pagination({ page, count, pageSize = 25, onPage }: { page: number; count: number; pageSize?: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (count <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[0.88rem] text-ink-2">
      <span>
        Showing <strong className="text-ink">{from}–{to}</strong> of <strong className="text-ink">{count}</strong>
      </span>
      <div className="flex gap-2">
        <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={16} aria-hidden /> Previous
        </button>
        <button className="btn btn-sm btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
