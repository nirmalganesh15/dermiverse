import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertTriangle, ArrowLeft, Banknote, Building2, CheckCircle2, CreditCard, RotateCcw, Smartphone, Wallet, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "../lib/api";
import { fromPaise, PAYMENT_MODES, rupees, toPaise } from "../lib/format";
import type { Invoice, PaymentMode } from "../lib/types";
import { MoneyInput } from "./MoneyInput";
import { Field, Modal, Spinner } from "./ui";

const MODE_ICONS: Record<PaymentMode, typeof Wallet> = {
  UPI: Smartphone,
  CASH: Banknote,
  CARD: CreditCard,
  BANK_TRANSFER: Building2,
  OTHER: Wallet,
};

export function ModePicker({ value, onChange, legend }: { value: PaymentMode; onChange: (m: PaymentMode) => void; legend: string }) {
  return (
    <fieldset>
      <legend className="field-label">{legend}</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {PAYMENT_MODES.map((m) => {
          const Icon = MODE_ICONS[m.value];
          const on = value === m.value;
          return (
            <label
              key={m.value}
              className={clsx(
                "flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center text-[0.8rem] font-medium transition",
                on ? "border-gold-500 bg-gold-50 text-ink ring-1 ring-gold-400" : "border-line-strong text-ink-2 hover:bg-cream",
              )}
            >
              <input type="radio" className="sr-only" name={legend} checked={on} onChange={() => onChange(m.value)} />
              <Icon size={18} className={on ? "text-gold-700" : "text-ink-3"} aria-hidden />
              {m.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function useInvoiceUpdate(invoice: Invoice) {
  const qc = useQueryClient();
  return (updated: Invoice) => {
    qc.setQueryData(["invoice", String(invoice.id)], updated);
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["refunds"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["report"] });
  };
}

/* ------------------------------------------------------------------ */
export function ReceivePaymentModal({ invoice, open, onOpenChange }: { invoice: Invoice; open: boolean; onOpenChange: (v: boolean) => void }) {
  const apply = useInvoiceUpdate(invoice);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("UPI");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setAmount(String(Number(invoice.balance_due)));
      setReference("");
      setNotes("");
      setError("");
    }
  }
  const due = toPaise(invoice.balance_due);
  const entered = toPaise(amount);

  const pay = useMutation({
    mutationFn: () =>
      api<Invoice>(`/invoices/${invoice.id}/payments/`, { method: "POST", json: { amount: fromPaise(entered), mode, reference, notes } }),
    onSuccess: (inv) => {
      apply(inv);
      toast.success(`${rupees(fromPaise(entered))} received`, {
        description: Number(inv.balance_due) > 0 ? `Balance due ${rupees(inv.balance_due)}` : "Invoice is now fully paid",
        icon: <CheckCircle2 className="text-success" size={20} />,
      });
      onOpenChange(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not record the payment."),
  });

  const submit = () => {
    if (!(entered > 0)) return setError("Enter the amount received.");
    if (entered > due) return setError(`That's more than the balance due (${rupees(invoice.balance_due)}).`);
    setError("");
    pay.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Receive payment"
      description={`${invoice.patient_name} · Invoice ${invoice.number}`}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="btn btn-gold" onClick={submit} disabled={pay.isPending}>
            {pay.isPending ? <Spinner /> : <CheckCircle2 size={18} aria-hidden />} Record {entered > 0 ? rupees(fromPaise(entered)) : "payment"}
          </button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-center justify-between rounded-xl bg-cream px-4 py-3">
          <span className="text-ink-2">Balance due</span>
          <span className="t-num text-[1.25rem] font-semibold">{rupees(invoice.balance_due)}</span>
        </div>
        <Field
          label="Amount received"
          htmlFor="pay-amount"
          error={error || undefined}
          hint={entered > 0 && entered < due ? `${rupees(fromPaise(due - entered))} will remain due.` : undefined}
        >
          <MoneyInput id="pay-amount" value={amount} onChange={setAmount} invalid={!!error} autoFocus />
        </Field>
        <ModePicker value={mode} onChange={setMode} legend="Paid by" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment reference" optional hint="UPI ID, card approval code, UTR">
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Note" optional>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
const REFUND_REASONS = ["Treatment not done", "Product returned", "Billed by mistake", "Duplicate payment", "Patient request"];

export function RefundModal({
  invoice,
  open,
  onOpenChange,
  startWithCancel,
}: {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  startWithCancel?: boolean;
}) {
  const apply = useInvoiceUpdate(invoice);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [cancelToo, setCancelToo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastOpen, setLastOpen] = useState(false);
  const max = toPaise(invoice.refundable_amount);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setStep("form");
      setAmount(String(Number(invoice.refundable_amount)));
      setMode(invoice.payments[0]?.mode ?? "CASH");
      setReference("");
      setReason("");
      setCancelToo(Boolean(startWithCancel));
      setErrors({});
    }
  }
  const entered = toPaise(amount);
  const isFull = entered === max;

  const refund = useMutation({
    mutationFn: () =>
      api<Invoice>(`/invoices/${invoice.id}/refund/`, {
        method: "POST",
        json: { amount: fromPaise(entered), mode, reference, reason, cancel_invoice: cancelToo && isFull },
      }),
    onSuccess: (inv) => {
      apply(inv);
      toast.success(`Refund of ${rupees(fromPaise(entered))} recorded`, {
        description: inv.status === "CANCELLED" ? "The invoice has been cancelled." : undefined,
      });
      onOpenChange(false);
    },
    onError: (e) => {
      setStep("form");
      setErrors({ _: e instanceof ApiError ? e.message : "Could not record the refund." });
    },
  });

  const next = () => {
    const errs: Record<string, string> = {};
    if (!(entered > 0)) errs.amount = "Enter the refund amount.";
    else if (entered > max) errs.amount = `You can refund at most ${rupees(invoice.refundable_amount)}.`;
    if (!reason.trim()) errs.reason = "Please give a reason. It is kept in the records.";
    setErrors(errs);
    if (!Object.keys(errs).length) setStep("confirm");
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={step === "form" ? "Refund payment" : "Confirm refund"}
      description={`${invoice.patient_name} · Invoice ${invoice.number}`}
      footer={
        step === "form" ? (
          <>
            <button className="btn btn-secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={next}>
              Review refund
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={() => setStep("form")} disabled={refund.isPending}>
              <ArrowLeft size={16} aria-hidden /> Back
            </button>
            <button className="btn btn-danger" onClick={() => refund.mutate()} disabled={refund.isPending}>
              {refund.isPending ? <Spinner /> : <RotateCcw size={17} aria-hidden />} Refund {rupees(fromPaise(entered))}
            </button>
          </>
        )
      }
    >
      {step === "form" ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl bg-cream px-4 py-3">
            <span className="text-ink-2">Collected on this invoice</span>
            <span className="t-num text-[1.15rem] font-semibold">{rupees(invoice.refundable_amount)}</span>
          </div>
          <Field label="Refund amount" htmlFor="refund-amount" error={errors.amount}>
            <MoneyInput id="refund-amount" value={amount} onChange={setAmount} invalid={!!errors.amount} autoFocus />
          </Field>
          <ModePicker value={mode} onChange={setMode} legend="Refund by" />
          <Field label="Refund reference" optional hint="UPI / bank transaction ID if refunded online">
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <div>
            <Field label="Reason for refund" error={errors.reason}>
              <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Common reasons">
              {REFUND_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="rounded-full border border-line-strong px-2.5 py-1 text-[0.8rem] text-ink-2 hover:border-gold-500 hover:bg-gold-50"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <label className={clsx("flex items-start gap-3 rounded-xl border px-4 py-3", isFull ? "cursor-pointer border-line-strong" : "border-line opacity-60")}>
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-danger)]"
              checked={cancelToo && isFull}
              disabled={!isFull}
              onChange={(e) => setCancelToo(e.target.checked)}
            />
            <span>
              <span className="block font-medium">Also cancel this invoice</span>
              <span className="block text-[0.85rem] text-ink-3">
                {isFull ? "Use when the whole bill is void." : "Only possible when refunding the full collected amount."}
              </span>
            </span>
          </label>
          {errors._ && (
            <p role="alert" className="field-error">
              {errors._}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-warning">
            <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
            <p className="text-[0.92rem] font-medium">Refunds are permanent records and cannot be edited or deleted afterwards.</p>
          </div>
          <dl className="divide-y divide-line rounded-xl border border-line">
            {[
              ["Refund amount", rupees(fromPaise(entered))],
              ["To", invoice.patient_name],
              ["Refund by", PAYMENT_MODES.find((m) => m.value === mode)?.label],
              ["Reference", reference || "—"],
              ["Reason", reason],
              ["Invoice", cancelToo && isFull ? `${invoice.number} will be cancelled` : `${invoice.number} stays active`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-2">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
export function CancelInvoiceModal({
  invoice,
  open,
  onOpenChange,
  onNeedRefund,
}: {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onNeedRefund: () => void;
}) {
  const apply = useInvoiceUpdate(invoice);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setReason("");
      setError("");
    }
  }
  const collected = Number(invoice.refundable_amount) > 0;
  const cancel = useMutation({
    mutationFn: () => api<Invoice>(`/invoices/${invoice.id}/cancel/`, { method: "POST", json: { reason } }),
    onSuccess: (inv) => {
      apply(inv);
      toast.success(`Invoice ${inv.number} cancelled`);
      onOpenChange(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not cancel the invoice."),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Cancel invoice?"
      description={`${invoice.number} · ${invoice.patient_name}`}
      footer={
        collected ? (
          <>
            <button className="btn btn-secondary" onClick={() => onOpenChange(false)}>
              Keep invoice
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                onOpenChange(false);
                onNeedRefund();
              }}
            >
              <RotateCcw size={17} aria-hidden /> Refund & cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={() => onOpenChange(false)}>
              Keep invoice
            </button>
            <button
              className="btn btn-danger"
              disabled={cancel.isPending}
              onClick={() => (reason.trim() ? cancel.mutate() : setError("Please give a reason for cancelling."))}
            >
              {cancel.isPending ? <Spinner /> : <XCircle size={17} aria-hidden />} Cancel invoice
            </button>
          </>
        )
      }
    >
      {collected ? (
        <p className="text-ink-2">
          {rupees(invoice.refundable_amount)} has already been collected on this invoice. Refund it first. You can cancel the
          invoice in the same step.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-ink-2">The invoice will stay in your records, marked as cancelled. Its number is not reused.</p>
          <Field label="Reason" error={error || undefined}>
            <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
        </div>
      )}
    </Modal>
  );
}
