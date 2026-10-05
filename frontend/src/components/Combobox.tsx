import clsx from "clsx";
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "./ui";

/**
 * Accessible combobox (WAI-ARIA 1.2 pattern): typing filters, ↑/↓ moves, Enter picks, Esc closes.
 * The trailing `action` row (e.g. "Add new patient") is reachable by keyboard like any option.
 */
export function Combobox<T>({
  value,
  onChange,
  options,
  getKey,
  renderOption,
  onSelect,
  action,
  emptyText,
  loading,
  inputProps,
  openOnFocus = true,
  className,
  listClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  options: T[];
  getKey: (o: T) => string | number;
  renderOption: (o: T, active: boolean) => ReactNode;
  onSelect: (o: T) => void;
  action?: { label: ReactNode; onSelect: () => void };
  emptyText?: ReactNode;
  loading?: boolean;
  inputProps?: InputHTMLAttributes<HTMLInputElement> & { "aria-label"?: string };
  openOnFocus?: boolean;
  className?: string;
  listClassName?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const count = options.length + (action ? 1 : 0);

  useEffect(() => setActive(0), [options.length, value]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (i: number) => {
    if (i < options.length) onSelect(options[i]);
    else action?.onSelect();
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (count ? (a + 1) % count : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (count ? (a - 1 + count) % count : 0));
    } else if (e.key === "Enter" && open && count) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const show = open && (count > 0 || loading || emptyText);
  return (
    <div ref={wrapRef} className={clsx("relative", className)}>
      <input
        {...inputProps}
        role="combobox"
        aria-expanded={Boolean(show)}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && count ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          if (openOnFocus) setOpen(true);
          inputProps?.onFocus?.(e);
        }}
        onKeyDown={onKeyDown}
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          className={clsx(
            "anim-pop absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-80 overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]",
            listClassName,
          )}
        >
          {loading && (
            <li className="flex items-center gap-2 px-3 py-2.5 text-ink-3">
              <Spinner size={16} /> Searching…
            </li>
          )}
          {!loading && options.length === 0 && emptyText && <li className="px-3 py-2.5 text-[0.9rem] text-ink-3">{emptyText}</li>}
          {options.map((o, i) => (
            <li
              key={getKey(o)}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={active === i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              onMouseEnter={() => setActive(i)}
              className={clsx("cursor-pointer rounded-lg px-3 py-2.5", active === i && "bg-gold-50 ring-1 ring-gold-200")}
            >
              {renderOption(o, active === i)}
            </li>
          ))}
          {action && (
            <li
              id={`${listId}-${options.length}`}
              role="option"
              aria-selected={active === options.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(options.length)}
              onMouseEnter={() => setActive(options.length)}
              className={clsx(
                "mt-1 cursor-pointer rounded-lg border-t border-line px-3 py-2.5 font-medium text-gold-700",
                active === options.length && "bg-gold-50",
              )}
            >
              {action.label}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 220) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
