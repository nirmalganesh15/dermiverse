import clsx from "clsx";

export function MoneyInput({
  id,
  value,
  onChange,
  invalid,
  autoFocus,
  className,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={clsx("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden>
        ₹
      </span>
      <input
        id={id}
        className="input t-num !pl-7 text-right"
        inputMode="decimal"
        value={value}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        onChange={(e) => onChange(sanitizeMoney(e.target.value))}
      />
    </div>
  );
}

export const sanitizeMoney = (v: string) => {
  const cleaned = v.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
};
