import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Pencil, Plus, Tags } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Field, EmptyState, ErrorNote, Modal, PageHeader, Pill, Segmented, SkeletonRows, Spinner, Amount } from "../components/ui";
import { MoneyInput } from "../components/MoneyInput";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { CATEGORIES, GST_RATES } from "../lib/format";
import type { Category, Service } from "../lib/types";

export default function ServicesPage() {
  const { user } = useAuth();
  const canEdit = Boolean(user?.can_manage);
  const list = useQuery({ queryKey: ["services", "all"], queryFn: () => api<Service[]>("/services/") });
  const [cat, setCat] = useState<"" | Category>("");
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Service | null | "new">(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list.data ?? []).filter(
      (s) => (!cat || s.category === cat) && (showInactive || s.is_active) && (!t || s.name.toLowerCase().includes(t)),
    );
  }, [list.data, cat, q, showInactive]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of list.data ?? []) if (s.is_active) c[s.category] = (c[s.category] ?? 0) + 1;
    return c;
  }, [list.data]);

  return (
    <div>
      <PageHeader
        eyebrow="Billing"
        title="Services & prices"
        subtitle="Treatments, products and packages that can be added to invoices."
        actions={
          canEdit && (
            <button className="btn btn-primary" onClick={() => setEditing("new")}>
              <Plus size={17} aria-hidden /> Add service
            </button>
          )
        }
      />

      <div className="card">
        <div className="flex flex-col gap-4 border-b border-line p-5">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Category">
            {[{ value: "", label: "All" }, ...CATEGORIES].map((c) => (
              <button
                key={c.value}
                role="tab"
                aria-selected={cat === c.value}
                onClick={() => setCat(c.value as "" | Category)}
                className={clsx(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.88rem] font-medium transition",
                  cat === c.value ? "bg-espresso text-on-espresso" : "text-ink-2 hover:bg-sand",
                )}
              >
                {c.label}
                {c.value && counts[c.value] ? <span className="ml-1.5 opacity-70">{counts[c.value]}</span> : null}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label htmlFor="svc-search" className="sr-only">
              Search services
            </label>
            <input id="svc-search" type="search" className="input sm:max-w-sm" placeholder="Search services" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="flex cursor-pointer items-center gap-2 text-[0.9rem] text-ink-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-gold-600)]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show hidden services
            </label>
          </div>
        </div>

        {list.isError ? (
          <div className="p-5">
            <ErrorNote message={(list.error as Error).message} onRetry={() => list.refetch()} />
          </div>
        ) : list.isLoading ? (
          <SkeletonRows />
        ) : !filtered.length ? (
          <EmptyState
            icon={<Tags size={24} />}
            title={list.data?.length ? "No services match" : "No services yet"}
            action={
              canEdit && !list.data?.length ? (
                <button className="btn btn-gold" onClick={() => setEditing("new")}>
                  <Plus size={17} aria-hidden /> Add your first service
                </button>
              ) : undefined
            }
          >
            {list.data?.length ? "Try another search or category." : "Add consultations, procedures and products with their prices."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((s) => (
              <li key={s.id} className={clsx("flex items-center gap-4 px-5 py-3.5", !s.is_active && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    {!s.is_active && <Pill>Hidden</Pill>}
                  </div>
                  <div className="mt-0.5 text-[0.84rem] text-ink-3">
                    {s.category_label}
                    {s.code && ` · HSN/SAC ${s.code}`}
                    {s.description && ` · ${s.description}`}
                  </div>
                </div>
                <div className="text-right">
                  <Amount value={s.price} className="font-semibold" />
                  <div className="text-[0.8rem] text-ink-3">{Number(s.tax_rate) ? `+ GST ${Number(s.tax_rate)}%` : "No GST"}</div>
                </div>
                {canEdit && (
                  <button className="icon-btn" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>
                    <Pencil size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ServiceModal service={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ServiceModal({ service, onClose }: { service: Service | null | "new"; onClose: () => void }) {
  const qc = useQueryClient();
  const open = service !== null;
  const isNew = service === "new";
  const [form, setForm] = useState({ name: "", category: "PROCEDURE" as Category, price: "", tax_rate: "18", code: "", description: "", is_active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [last, setLast] = useState<typeof service>(null);
  if (service !== last) {
    setLast(service);
    if (service) {
      setErrors({});
      setForm(
        service === "new"
          ? { name: "", category: "PROCEDURE", price: "", tax_rate: "18", code: "", description: "", is_active: true }
          : {
              name: service.name,
              category: service.category,
              price: String(Number(service.price)),
              tax_rate: String(Number(service.tax_rate)),
              code: service.code,
              description: service.description,
              is_active: service.is_active,
            },
      );
    }
  }
  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api<Service>("/services/", { method: "POST", json: form })
        : api<Service>(`/services/${(service as Service).id}/`, { method: "PATCH", json: form }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["services"] });
      toast.success(isNew ? `${s.name} added` : `${s.name} updated`);
      onClose();
    },
    onError: (e) => setErrors(e instanceof ApiError ? { ...e.fields, _: e.message } : { _: "Could not save." }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Enter the service name.";
    if (form.price === "" || Number(form.price) < 0) errs.price = "Enter a price (0 or more).";
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={isNew ? "Add service" : "Edit service"}
      description="Price is before GST. Price changes apply to new invoices only."
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" form="svc-form" disabled={save.isPending}>
            {save.isPending && <Spinner />} {isNew ? "Add service" : "Save changes"}
          </button>
        </>
      }
    >
      <form id="svc-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Service name" error={errors.name} className="sm:col-span-2">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <div className="sm:col-span-2">
          <div className="field-label">Category</div>
          <Segmented
            name="svc-cat"
            label="Category"
            value={form.category}
            onChange={(v) => setForm({ ...form, category: v, tax_rate: v === "CONSULTATION" ? "0" : form.tax_rate })}
            options={CATEGORIES.map((c) => ({ value: c.value as Category, label: c.label }))}
          />
        </div>
        <Field label="Price (before GST)" htmlFor="svc-price" error={errors.price}>
          <MoneyInput id="svc-price" value={form.price} onChange={(v) => setForm({ ...form, price: v })} invalid={!!errors.price} />
        </Field>
        <Field label="GST">
          <select className="input" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}>
            {GST_RATES.map((r) => (
              <option key={r} value={r}>
                {r === "0" ? "No GST" : `${r}%`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="HSN / SAC code" optional>
          <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </Field>
        <Field label="Short description" optional>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {!isNew && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong px-4 py-3 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-gold-600)]"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>
              <span className="block font-medium">Available for billing</span>
              <span className="block text-[0.85rem] text-ink-3">Untick to hide it from new invoices. Past invoices are not affected.</span>
            </span>
          </label>
        )}
        {errors._ && !errors.name && !errors.price && (
          <p className="field-error sm:col-span-2" role="alert">
            {errors._}
          </p>
        )}
      </form>
    </Modal>
  );
}
