import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { AlertCircle, CheckCircle2, CircleDashed, Clock3, Loader2, X, XCircle } from "lucide-react";
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import type { PaymentStatus } from "../lib/types";
import { rupees } from "../lib/format";

/* ---------------- Page header ---------------- */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="t-overline mb-2 text-gold-700">{eyebrow}</div>}
        <h1 className="t-display">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[0.98rem] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/* ---------------- Field (label + control + hint + error), always programmatically linked ---------------- */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactElement<Record<string, unknown>>;
  className?: string;
  optional?: boolean;
  /** Set when the control is nested inside a wrapper; the control must then carry this id itself. */
  htmlFor?: string;
}) {
  const genId = useId();
  const id = htmlFor ?? (children.props.id as string) ?? genId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const control =
    isValidElement(children) && !htmlFor
      ? cloneElement(children, {
          id,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined,
        })
      : children;
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-3">(optional)</span>}
      </label>
      {control}
      {error ? (
        <p id={errId} className="field-error" role="alert">
          <AlertCircle size={15} aria-hidden /> {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/* ---------------- Status badge: icon + word + colour (never colour alone) ---------------- */
const STATUS: Record<PaymentStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  PAID: { label: "Paid", cls: "bg-success-bg text-success", Icon: CheckCircle2 },
  PARTIAL: { label: "Partially paid", cls: "bg-warning-bg text-warning", Icon: CircleDashed },
  PENDING: { label: "Payment pending", cls: "bg-danger-bg text-danger", Icon: Clock3 },
  CANCELLED: { label: "Cancelled", cls: "bg-neutral-bg text-neutral", Icon: XCircle },
};
export function StatusBadge({ status, size = "md" }: { status: PaymentStatus; size?: "sm" | "md" }) {
  const s = STATUS[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
        s.cls,
        size === "sm" ? "px-2 py-0.5 text-[0.76rem]" : "px-2.5 py-1 text-[0.8rem]",
      )}
    >
      <s.Icon size={size === "sm" ? 13 : 14} strokeWidth={2.4} aria-hidden />
      {s.label}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "gold" | "info" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.74rem] font-semibold whitespace-nowrap",
        tone === "gold" && "bg-gold-100 text-gold-800",
        tone === "neutral" && "bg-neutral-bg text-neutral",
        tone === "info" && "bg-info-bg text-info",
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- Money ---------------- */
export function Amount({ value, className, muted }: { value: string | number; className?: string; muted?: boolean }) {
  return <span className={clsx("t-num whitespace-nowrap", muted && "text-ink-3", className)}>{rupees(value)}</span>;
}

/* ---------------- Modal: centred dialog on desktop, bottom sheet on phones ---------------- */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-espresso/45 backdrop-blur-[3px]" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            // Focus the field the user will type into first, not the close button.
            const root = e.currentTarget as HTMLElement;
            const target =
              root.querySelector<HTMLElement>("[data-autofocus]") ??
              root.querySelector<HTMLElement>(
                "input:not([type=radio]):not([type=checkbox]):not([type=file]):not([disabled]), textarea:not([disabled]), select:not([disabled])",
              );
            if (target) {
              e.preventDefault();
              target.focus();
              if (target instanceof HTMLInputElement) target.select();
            }
          }}
          className={clsx(
            "anim-dialog fixed z-50 flex max-h-[92dvh] w-full flex-col bg-white shadow-[var(--shadow-pop)] outline-none",
            "bottom-0 left-0 rounded-t-2xl",
            "sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            size === "sm" && "sm:max-w-md",
            size === "md" && "sm:max-w-xl",
            size === "lg" && "sm:max-w-3xl",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-5">
            <div>
              <Dialog.Title className="t-title">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-[0.92rem] text-ink-2">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="icon-btn -mr-2 -mt-1" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2.5 border-t border-line bg-ivory/60 px-6 py-4 sm:flex-row sm:justify-end sm:rounded-b-2xl">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------------- Segmented radio group ---------------- */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  name,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  label: string;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="segment">
      {options.map((o) => (
        <label key={o.value} className="segment-item" data-checked={value === o.value}>
          <input
            type="radio"
            className="sr-only"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.icon}
          {o.label}
        </label>
      ))}
    </div>
  );
}

/* ---------------- Misc ---------------- */
export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={clsx("animate-spin", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-200">
        {icon}
      </div>
      <h3 className="t-heading">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-bg px-4 py-3 text-danger">
      <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1 text-[0.92rem] font-medium">{message}</div>
      {onRetry && (
        <button className="btn btn-sm btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-5 flex-1" style={{ maxWidth: c === 1 ? "none" : 140 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function KeyValue({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-4 py-1.5", strong && "font-semibold text-ink")}>
      <dt className={clsx(strong ? "text-ink" : "text-ink-2")}>{label}</dt>
      <dd className="t-num text-right">{children}</dd>
    </div>
  );
}
