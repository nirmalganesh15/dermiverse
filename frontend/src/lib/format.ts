import { format, isToday, isYesterday, parseISO } from "date-fns";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const inrRound = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** ₹1,23,456.00 */
export const rupees = (v: string | number | null | undefined) => inr.format(Number(v ?? 0));
/** ₹1,23,456 (for headline figures) */
export const rupeesShort = (v: string | number | null | undefined) => inrRound.format(Math.round(Number(v ?? 0)));
export const plainNumber = (v: string | number) => num.format(Number(v));

export const toDate = (iso: string) => parseISO(iso);
export const fmtDate = (iso: string) => format(parseISO(iso), "d MMM yyyy");
export const fmtTime = (iso: string) => format(parseISO(iso), "h:mm a");
export const fmtDateTime = (iso: string) => format(parseISO(iso), "d MMM yyyy, h:mm a");
export function fmtRelativeDay(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "h:mm a")}`;
  return format(d, "d MMM, h:mm a");
}
export const isoDate = (d: Date) => format(d, "yyyy-MM-dd");

/** Money math in integer paise to avoid floating point drift in the live preview. */
export const toPaise = (v: string | number) => Math.round(Number(v || 0) * 100);
export const fromPaise = (p: number) => (p / 100).toFixed(2);

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function initials(name: string) {
  return name
    .replace(/^dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export const PAYMENT_MODES: { value: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER"; label: string; needsRef: boolean }[] = [
  { value: "UPI", label: "UPI", needsRef: true },
  { value: "CASH", label: "Cash", needsRef: false },
  { value: "CARD", label: "Card", needsRef: true },
  { value: "BANK_TRANSFER", label: "Bank transfer", needsRef: true },
  { value: "OTHER", label: "Other", needsRef: false },
];

export const CATEGORIES = [
  { value: "CONSULTATION", label: "Consultation" },
  { value: "PROCEDURE", label: "Procedure" },
  { value: "PRODUCT", label: "Product" },
  { value: "PACKAGE", label: "Package" },
  { value: "OTHER", label: "Other" },
] as const;

export const GST_RATES = ["0", "5", "12", "18", "28"];
