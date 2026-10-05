import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { format } from "date-fns";
import {
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  NotebookPen,
  Plus,
  Printer,
  Smartphone,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Combobox } from "../components/Combobox";
import { PatientPicker } from "../components/patients";
import { MoneyInput, sanitizeMoney } from "../components/MoneyInput";
import { Field, PageHeader, Segmented, Spinner } from "../components/ui";
import { api, ApiError, openPdf } from "../lib/api";
import { useClinic } from "../lib/auth";
import { fromPaise, GST_RATES, PAYMENT_MODES, rupees, toPaise } from "../lib/format";
import type { Category, Doctor, Invoice, Patient, PaymentMode, Service } from "../lib/types";

type Line = {
  key: number;
  service: number | null;
  description: string;
  category: Category | "";
  details: string;
  showDetails: boolean;
  quantity: string;
  unit_price: string;
  discount_type: "AMOUNT" | "PERCENT";
  discount_value: string;
  tax_rate: string;
};

let lineSeq = 1;
const emptyLine = (): Line => ({
  key: lineSeq++,
  service: null,
  description: "",
  category: "",
  details: "",
  showDetails: false,
  quantity: "1",
  unit_price: "",
  discount_type: "AMOUNT",
  discount_value: "",
  tax_rate: "0",
});

function calcLine(l: Line) {
  const qty = Number(l.quantity) || 0;
  const gross = Math.round(qty * toPaise(l.unit_price));
  let disc = l.discount_type === "PERCENT" ? Math.round((gross * (Number(l.discount_value) || 0)) / 100) : toPaise(l.discount_value);
  disc = Math.min(Math.max(disc, 0), gross);
  const taxable = gross - disc;
  const tax = Math.round((taxable * (Number(l.tax_rate) || 0)) / 100);
  return { gross, disc, taxable, tax, total: taxable + tax };
}

const MODE_ICONS: Record<PaymentMode, typeof Wallet> = {
  UPI: Smartphone,
  CASH: Banknote,
  CARD: CreditCard,
  BANK_TRANSFER: Building2,
  OTHER: Wallet,
};
const REF_LABEL: Record<PaymentMode, string> = {
  UPI: "UPI transaction ID",
  CASH: "Reference",
  CARD: "Card approval code / last 4 digits",
  BANK_TRANSFER: "Bank reference (UTR)",
  OTHER: "Reference",
};

function readPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export default function NewInvoicePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const clinic = useClinic();
  const services = useQuery({ queryKey: ["services", "active"], queryFn: () => api<Service[]>("/services/?is_active=true") });
  const doctors = useQuery({ queryKey: ["doctors"], queryFn: () => api<Doctor[]>("/doctors/") });

  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctorId, setDoctorId] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [payPlan, setPayPlan] = useState<"FULL" | "PART" | "LATER">("FULL");
  const [partAmount, setPartAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>(() => readPref("dv.payMode", "UPI") as PaymentMode);
  const [reference, setReference] = useState("");
  const [printAfter, setPrintAfter] = useState(() => readPref("dv.printAfter", "1") === "1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const descRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusKey = useRef<number | null>(null);

  useEffect(() => {
    if (!doctorId && doctors.data?.length) {
      const d = doctors.data.find((x) => x.is_default && x.is_active) ?? doctors.data.find((x) => x.is_active);
      if (d) setDoctorId(String(d.id));
    }
  }, [doctors.data, doctorId]);

  useEffect(() => {
    if (focusKey.current != null) {
      descRefs.current[focusKey.current]?.focus();
      focusKey.current = null;
    }
  });

  const totals = useMemo(() => {
    let gross = 0, disc = 0, tax = 0;
    for (const l of lines) {
      const c = calcLine(l);
      gross += c.gross;
      disc += c.disc;
      tax += c.tax;
    }
    const exact = gross - disc + tax;
    const total = clinic.data?.round_off_total === false ? exact : Math.round(exact / 100) * 100;
    return { gross, disc, tax, roundOff: total - exact, total };
  }, [lines, clinic.data?.round_off_total]);

  const payNow = payPlan === "FULL" ? totals.total : payPlan === "PART" ? Math.min(toPaise(partAmount), totals.total) : 0;
  const balance = totals.total - payNow;

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = (from?: Service) => {
    const fresh = from ? fromService(emptyLine(), from) : emptyLine();
    setLines((ls) => {
      // Fill the first blank row instead of appending under it.
      const blankIdx = ls.findIndex((l) => !l.description && !l.unit_price);
      if (from && blankIdx >= 0) return ls.map((l, i) => (i === blankIdx ? { ...fromService(l, from) } : l));
      return [...ls, fresh];
    });
    if (!from) focusKey.current = fresh.key;
  };
  const removeLine = (key: number) => setLines((ls) => (ls.length === 1 ? [emptyLine()] : ls.filter((l) => l.key !== key)));

  const quickPicks = useMemo(() => {
    const list = services.data ?? [];
    return [...list.filter((s) => s.category === "CONSULTATION"), ...list.filter((s) => s.category !== "CONSULTATION")].slice(0, 6);
  }, [services.data]);

  const create = useMutation({
    mutationFn: () => {
      const items = lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          service: l.service,
          description: l.description.trim(),
          category: l.category || undefined,
          details: l.details.trim(),
          quantity: l.quantity || "1",
          unit_price: l.unit_price || "0",
          discount_type: l.discount_type,
          discount_value: l.discount_value || "0",
          tax_rate: l.tax_rate || "0",
        }));
      return api<Invoice>("/invoices/", {
        method: "POST",
        json: {
          patient: patient!.id,
          doctor: doctorId ? Number(doctorId) : null,
          invoice_date: new Date(invoiceDate).toISOString(),
          notes: notes.trim(),
          items,
          payment: payNow > 0 ? { amount: fromPaise(payNow), mode, reference: reference.trim() } : null,
        },
      });
    },
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      writePref("dv.payMode", mode);
      toast.success(`Invoice ${inv.number} created`, {
        description: `${inv.patient_name} · ${rupees(inv.total)}`,
        icon: <CheckCircle2 className="text-success" size={20} />,
      });
      if (printAfter) openPdf(`/invoices/${inv.id}/pdf/`, "print", `${inv.number}.pdf`).catch(() => {});
      navigate(`/invoices/${inv.id}`, { state: { justCreated: true } });
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : "Could not create the invoice.";
      setErrors({ _: msg });
      toast.error(msg);
    },
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!patient) errs.patient = "Choose a patient or add a new one.";
    const filled = lines.filter((l) => l.description.trim());
    if (!filled.length) errs.items = "Add at least one treatment or product.";
    for (const l of lines) {
      if (!l.description.trim() && !l.unit_price) continue;
      if (!l.description.trim()) errs[`d${l.key}`] = "Enter what is being billed.";
      if (!(Number(l.quantity) > 0)) errs[`q${l.key}`] = "Quantity must be at least 1.";
      if (l.unit_price === "" || Number(l.unit_price) < 0) errs[`p${l.key}`] = "Enter a price.";
      if (l.discount_type === "PERCENT" && Number(l.discount_value) > 100) errs[`x${l.key}`] = "Max 100%.";
      if (l.discount_type === "AMOUNT" && toPaise(l.discount_value) > calcLine({ ...l, discount_value: "0" }).gross)
        errs[`x${l.key}`] = "More than the item amount.";
    }
    if (payPlan === "PART") {
      if (!(toPaise(partAmount) > 0)) errs.part = "Enter the amount received now.";
      else if (toPaise(partAmount) > totals.total) errs.part = "Can't be more than the invoice total.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = () => {
    if (create.isPending) return;
    if (validate()) create.mutate();
    else toast.error("Please check the highlighted fields.");
  };

  // Ctrl/Cmd + Enter saves from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const activeDoctors = (doctors.data ?? []).filter((d) => d.is_active);

  return (
    <div>
      <PageHeader eyebrow="Billing" title="New invoice" subtitle="Choose the patient, add treatments, collect payment." />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="space-y-6">
          {/* 1. Patient */}
          <section className="card card-pad" aria-labelledby="sec-patient">
            <SectionTitle n={1} id="sec-patient" title="Patient" />
            <PatientPicker value={patient} onChange={setPatient} error={errors.patient} autoFocus />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Doctor">
                <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  <option value="">Not specified</option>
                  {activeDoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice date & time">
                <input type="datetime-local" className="input" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </Field>
            </div>
          </section>

          {/* 2. Items */}
          <section className="card" aria-labelledby="sec-items">
            <div className="card-pad pb-0">
              <SectionTitle n={2} id="sec-items" title="Treatments & products" />
              {quickPicks.length > 0 && (
                <div className="mb-5">
                  <div className="mb-2 flex items-center gap-1.5 text-[0.82rem] font-medium text-ink-3">
                    <Sparkles size={14} className="text-gold-600" aria-hidden /> Quick add
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickPicks.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addLine(s)}
                        className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-[0.86rem] transition hover:border-gold-500 hover:bg-gold-50"
                      >
                        <Plus size={14} className="text-gold-700" aria-hidden />
                        <span className="font-medium">{s.name}</span>
                        <span className="t-num text-ink-3">{rupees(s.price).replace(".00", "")}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <ol className="divide-y divide-line/80">
              {lines.map((l, idx) => (
                <ItemRow
                  key={l.key}
                  index={idx}
                  line={l}
                  services={services.data ?? []}
                  errors={errors}
                  inputRef={(el) => (descRefs.current[l.key] = el)}
                  onChange={(patch) => update(l.key, patch)}
                  onRemove={() => removeLine(l.key)}
                  onEnterLast={idx === lines.length - 1 ? () => addLine() : undefined}
                />
              ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addLine()}>
                <Plus size={16} aria-hidden /> Add another item
              </button>
              {errors.items && (
                <p className="field-error !mt-0" role="alert">
                  {errors.items}
                </p>
              )}
            </div>
          </section>

          {/* 3. Notes */}
          <section className="card card-pad">
            {showNotes || notes ? (
              <Field label="Notes for this invoice" optional hint="Printed on the invoice. E.g. “Session 2 of 6”, next visit date.">
                <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus />
              </Field>
            ) : (
              <button type="button" className="btn btn-ghost -ml-2" onClick={() => setShowNotes(true)}>
                <NotebookPen size={17} aria-hidden /> Add a note to this invoice
              </button>
            )}
          </section>
        </div>

        {/* Summary + payment */}
        <aside id="pay-panel" className="scroll-mt-20 lg:sticky lg:top-24" aria-label="Invoice summary and payment">
          <div className="card overflow-hidden">
            <div className="bg-espresso px-6 pb-5 pt-5 text-on-espresso">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-gold-300">Invoice total</div>
              <div className="t-num mt-1 font-display text-[2.6rem] font-semibold leading-none text-white" aria-live="polite">
                {rupees(fromPaise(totals.total))}
              </div>
              <dl className="mt-4 space-y-1 text-[0.88rem] text-on-espresso-2">
                <Row label="Subtotal" value={totals.gross} />
                {totals.disc > 0 && <Row label="Discount" value={-totals.disc} />}
                {totals.tax > 0 && <Row label="GST" value={totals.tax} />}
                {totals.roundOff !== 0 && <Row label="Round off" value={totals.roundOff} />}
              </dl>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <div className="field-label">Payment</div>
                <Segmented
                  name="payplan"
                  label="Payment"
                  value={payPlan}
                  onChange={setPayPlan}
                  options={[
                    { value: "FULL", label: "Full" },
                    { value: "PART", label: "Part" },
                    { value: "LATER", label: "Pay later" },
                  ]}
                />
              </div>

              {payPlan === "PART" && (
                <Field label="Amount received now" error={errors.part} htmlFor="part-amount">
                  <MoneyInput id="part-amount" value={partAmount} onChange={setPartAmount} invalid={!!errors.part} autoFocus />
                </Field>
              )}

              {payPlan !== "LATER" && (
                <>
                  <fieldset>
                    <legend className="field-label">Paid by</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {PAYMENT_MODES.map((m) => {
                        const Icon = MODE_ICONS[m.value];
                        const on = mode === m.value;
                        return (
                          <label
                            key={m.value}
                            className={clsx(
                              "flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center text-[0.8rem] font-medium transition",
                              on ? "border-gold-500 bg-gold-50 text-ink ring-1 ring-gold-400" : "border-line-strong text-ink-2 hover:bg-cream",
                            )}
                          >
                            <input type="radio" name="mode" className="sr-only" checked={on} onChange={() => setMode(m.value)} />
                            <Icon size={18} className={on ? "text-gold-700" : "text-ink-3"} aria-hidden />
                            {m.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  {mode !== "CASH" && (
                    <Field label={REF_LABEL[mode]} optional>
                      <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
                    </Field>
                  )}
                </>
              )}

              <dl className="rounded-xl bg-cream/80 px-4 py-3 text-[0.92rem]">
                <div className="flex justify-between py-0.5">
                  <dt className="text-ink-2">Collecting now</dt>
                  <dd className="t-num font-semibold">{rupees(fromPaise(payNow))}</dd>
                </div>
                <div className="flex justify-between py-0.5">
                  <dt className="text-ink-2">Balance due</dt>
                  <dd className={clsx("t-num font-semibold", balance > 0 && "text-danger")}>{rupees(fromPaise(balance))}</dd>
                </div>
              </dl>

              {errors._ && (
                <p role="alert" className="field-error">
                  {errors._}
                </p>
              )}

              <div className="space-y-3">
                <button type="button" className="btn btn-gold btn-lg w-full" onClick={submit} disabled={create.isPending}>
                  {create.isPending ? <Spinner /> : <FileCheck2 size={19} aria-hidden />}
                  Create invoice
                </button>
                <label className="flex cursor-pointer items-center justify-center gap-2 text-[0.88rem] text-ink-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--color-gold-600)]"
                    checked={printAfter}
                    onChange={(e) => {
                      setPrintAfter(e.target.checked);
                      writePref("dv.printAfter", e.target.checked ? "1" : "0");
                    }}
                  />
                  <Printer size={15} aria-hidden /> Print right after saving
                </label>
                <p className="hidden text-center text-[0.78rem] text-ink-3 lg:block">
                  Shortcut: <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-sans">Ctrl</kbd> +{" "}
                  <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-sans">Enter</kbd>
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Phones/tablets: total and the main action always within reach */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(30_25_19/0.25)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[0.76rem] text-ink-3">Total</div>
            <div className="t-num truncate text-[1.25rem] font-semibold leading-tight">{rupees(fromPaise(totals.total))}</div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => document.getElementById("pay-panel")?.scrollIntoView({ behavior: "smooth" })}
          >
            Payment
          </button>
          <button type="button" className="btn btn-gold" onClick={submit} disabled={create.isPending}>
            {create.isPending ? <Spinner /> : <FileCheck2 size={18} aria-hidden />} Create
          </button>
        </div>
      </div>
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  );
}

function fromService(l: Line, s: Service): Line {
  return {
    ...l,
    service: s.id,
    description: s.name,
    category: s.category,
    unit_price: String(Number(s.price)),
    tax_rate: String(Number(s.tax_rate)),
  };
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="t-num">{value < 0 ? `− ${rupees(fromPaise(-value))}` : rupees(fromPaise(value))}</dd>
    </div>
  );
}

function SectionTitle({ n, title, id }: { n: number; title: string; id: string }) {
  return (
    <h2 id={id} className="mb-4 flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-espresso text-[0.8rem] font-semibold text-gold-300" aria-hidden>
        {n}
      </span>
      <span className="t-heading">{title}</span>
    </h2>
  );
}

function ItemRow({
  index,
  line: l,
  services,
  errors,
  inputRef,
  onChange,
  onRemove,
  onEnterLast,
}: {
  index: number;
  line: Line;
  services: Service[];
  errors: Record<string, string>;
  inputRef: (el: HTMLInputElement | null) => void;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
  onEnterLast?: () => void;
}) {
  const c = calcLine(l);
  const n = index + 1;
  const matches = useMemo(() => {
    const t = l.description.trim().toLowerCase();
    if (l.service && services.find((s) => s.id === l.service)?.name === l.description) return [];
    return (t ? services.filter((s) => s.name.toLowerCase().includes(t)) : services).slice(0, 8);
  }, [l.description, l.service, services]);
  const err = (k: string) => errors[`${k}${l.key}`];
  const onKeyDownEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && onEnterLast) {
      e.preventDefault();
      onEnterLast();
    }
  };

  return (
    <li className="px-4 py-5 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="mt-2.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cream text-[0.76rem] font-semibold text-ink-2" aria-hidden>
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`desc-${l.key}`}>
            Item {n}
          </label>
          <Combobox
            value={l.description}
            onChange={(v) => onChange({ description: v, service: null })}
            options={matches}
            getKey={(s) => s.id}
            openOnFocus={!l.description}
            onSelect={(s) => onChange(fromService(l, s))}
            renderOption={(s) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="text-[0.78rem] text-ink-3">
                    {s.category_label}
                    {Number(s.tax_rate) > 0 && ` · GST ${Number(s.tax_rate)}%`}
                  </div>
                </div>
                <span className="t-num text-[0.9rem] font-medium">{rupees(s.price)}</span>
              </div>
            )}
            inputProps={{
              id: `desc-${l.key}`,
              ref: inputRef,
              className: "input",
              placeholder: "Search a service or type any item",
              "aria-invalid": err("d") ? true : undefined,
            } as React.InputHTMLAttributes<HTMLInputElement>}
          />
          {err("d") && <p className="field-error">{err("d")}</p>}
          {l.showDetails || l.details ? (
            <input
              className="input input-sm mt-2"
              placeholder="Details, e.g. Session 2 of 6, full face"
              aria-label={`Details for item ${n}`}
              value={l.details}
              onChange={(e) => onChange({ details: e.target.value })}
              autoFocus={l.showDetails && !l.details}
            />
          ) : (
            <button
              type="button"
              className="mt-1.5 text-[0.82rem] font-medium text-gold-700 underline-offset-2 hover:underline"
              onClick={() => onChange({ showDetails: true })}
            >
              + Add session details
            </button>
          )}
        </div>
        <button type="button" onClick={onRemove} className="icon-btn mt-0.5 hover:!bg-danger-bg hover:!text-danger" aria-label={`Remove item ${n}`}>
          <Trash2 size={17} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 pl-9 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1.15fr)_7.5rem] lg:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1.15fr)_7.5rem_minmax(7.5rem,auto)]">

        <div>
          <label className="field-label !text-[0.78rem]" htmlFor={`qty-${l.key}`}>
            Qty
          </label>
          <input
            id={`qty-${l.key}`}
            className="input t-num text-center"
            inputMode="decimal"
            value={l.quantity}
            aria-invalid={err("q") ? true : undefined}
            onChange={(e) => onChange({ quantity: sanitizeMoney(e.target.value) })}
            onKeyDown={onKeyDownEnter}
          />
        </div>

        <div>
          <label className="field-label !text-[0.78rem]" htmlFor={`price-${l.key}`}>
            Price
          </label>
          <MoneyInput id={`price-${l.key}`} value={l.unit_price} invalid={!!err("p")} onChange={(v) => onChange({ unit_price: v })} />
          {err("p") && <p className="field-error">{err("p")}</p>}
        </div>

        <div>
          <span className="field-label !text-[0.78rem]" id={`disc-l-${l.key}`}>
            Discount
          </span>
          <div className="flex" role="group" aria-labelledby={`disc-l-${l.key}`}>
            <input
              className="input t-num !rounded-r-none text-right"
              inputMode="decimal"
              placeholder="0"
              aria-label={`Discount for item ${n} in ${l.discount_type === "PERCENT" ? "percent" : "rupees"}`}
              value={l.discount_value}
              aria-invalid={err("x") ? true : undefined}
              onChange={(e) => onChange({ discount_value: sanitizeMoney(e.target.value) })}
              onKeyDown={onKeyDownEnter}
            />
            <button
              type="button"
              className="h-[2.65rem] w-11 shrink-0 rounded-r-xl border border-l-0 border-line-strong bg-cream font-semibold text-ink-2 hover:bg-sand"
              onClick={() => onChange({ discount_type: l.discount_type === "AMOUNT" ? "PERCENT" : "AMOUNT" })}
              aria-label={`Discount in ${l.discount_type === "PERCENT" ? "percent" : "rupees"}. Switch to ${l.discount_type === "PERCENT" ? "rupees" : "percent"}`}
              title="Switch between ₹ and %"
            >
              {l.discount_type === "PERCENT" ? "%" : "₹"}
            </button>
          </div>
          {err("x") && <p className="field-error">{err("x")}</p>}
        </div>

        <div>
          <label className="field-label !text-[0.78rem]" htmlFor={`gst-${l.key}`}>
            GST
          </label>
          <select id={`gst-${l.key}`} className="input" value={l.tax_rate} onChange={(e) => onChange({ tax_rate: e.target.value })}>
            {GST_RATES.map((r) => (
              <option key={r} value={r}>
                {r === "0" ? "No GST" : `${r}%`}
              </option>
            ))}
            {!GST_RATES.includes(l.tax_rate) && <option value={l.tax_rate}>{l.tax_rate}%</option>}
          </select>
        </div>

        <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-4 lg:col-span-1 lg:block lg:text-right">
          <span className="field-label !mb-0 !text-[0.78rem] lg:!mb-1.5 lg:block">Amount</span>
          <div>
            <div className="t-num text-[1.05rem] font-semibold lg:leading-[2.65rem]">{rupees(fromPaise(c.total))}</div>
            {(c.disc > 0 || c.tax > 0) && (
              <div className="t-num text-[0.76rem] text-ink-3 lg:-mt-2">
                {c.disc > 0 && `−${rupees(fromPaise(c.disc)).replace(".00", "")} `}
                {c.tax > 0 && `+GST ${rupees(fromPaise(c.tax)).replace(".00", "")}`}
              </div>
            )}
          </div>
        </div>

      </div>
    </li>
  );
}
