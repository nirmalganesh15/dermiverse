export type Money = string; // DRF sends decimals as strings; never do float math on stored amounts

export type Role = "ADMIN" | "DOCTOR" | "FRONT_DESK";
export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  display_name: string;
  role: Role;
  role_label: string;
  can_manage: boolean;
}

export interface Patient {
  id: number;
  uhid: string;
  name: string;
  phone: string;
  gender: "" | "F" | "M" | "O";
  gender_label: string;
  date_of_birth: string | null;
  age_years: number | null;
  age: number | null;
  email: string;
  address: string;
  notes: string;
  created_at: string;
}

export type Category = "CONSULTATION" | "PROCEDURE" | "PRODUCT" | "PACKAGE" | "OTHER";
export interface Service {
  id: number;
  name: string;
  category: Category;
  category_label: string;
  price: Money;
  tax_rate: Money;
  code: string;
  description: string;
  is_active: boolean;
}

export interface Doctor {
  id: number;
  name: string;
  qualification: string;
  registration_no: string;
  is_default: boolean;
  is_active: boolean;
}

export type PaymentMode = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";
export type PaymentStatus = "PAID" | "PARTIAL" | "PENDING" | "CANCELLED";

export interface InvoiceItem {
  id: number;
  service: number | null;
  description: string;
  category: Category;
  category_label: string;
  details: string;
  code: string;
  quantity: Money;
  unit_price: Money;
  discount_type: "AMOUNT" | "PERCENT";
  discount_value: Money;
  discount_amount: Money;
  taxable_amount: Money;
  tax_rate: Money;
  tax_amount: Money;
  line_total: Money;
}

export interface Payment {
  id: number;
  receipt_number: string;
  invoice: number;
  invoice_number: string;
  patient: number;
  patient_name: string;
  patient_uhid: string;
  amount: Money;
  mode: PaymentMode;
  mode_label: string;
  reference: string;
  notes: string;
  paid_at: string;
  received_by_name: string;
}

export interface Refund {
  id: number;
  refund_number: string;
  invoice: number;
  invoice_number: string;
  patient: number;
  patient_name: string;
  patient_uhid: string;
  amount: Money;
  mode: PaymentMode;
  mode_label: string;
  reference: string;
  reason: string;
  refunded_at: string;
  created_by_name: string;
}

export interface InvoiceSummary {
  id: number;
  number: string;
  invoice_date: string;
  status: "ACTIVE" | "CANCELLED";
  payment_status: PaymentStatus;
  patient: number;
  patient_name: string;
  patient_uhid: string;
  patient_phone: string;
  doctor_name: string;
  total: Money;
  amount_paid: Money;
  amount_refunded: Money;
  balance_due: Money;
  item_summary: string;
}

export interface Invoice extends InvoiceSummary {
  patient_detail: Patient;
  doctor: number | null;
  doctor_detail: Doctor | null;
  items: InvoiceItem[];
  payments: Payment[];
  refunds: Refund[];
  subtotal: Money;
  discount_total: Money;
  taxable_total: Money;
  tax_total: Money;
  round_off: Money;
  refundable_amount: Money;
  notes: string;
  cancel_reason: string;
  cancelled_at: string | null;
  cancelled_by_name: string;
  created_by_name: string;
  created_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ClinicSettings {
  name: string;
  subtitle: string;
  tagline: string;
  address: string;
  state: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  google_business: string;
  working_hours: string;
  gstin: string;
  registration_no: string;
  invoice_prefix: string;
  round_off_total: boolean;
  show_doctor_registration: boolean;
  invoice_terms: string;
  refund_policy: string;
  invoice_footer: string;
  signature: string | null;
  updated_at: string;
}

export interface DayPoint {
  date: string;
  collected: Money;
  billed: Money;
}

export interface Dashboard {
  today: {
    collected: Money;
    refunded: Money;
    invoice_count: number;
    billed: Money;
    patients: number;
    by_mode: { mode: PaymentMode; label: string; amount: Money }[];
  };
  month: { collected: Money; label: string };
  outstanding: { amount: Money; count: number };
  trend: DayPoint[];
  recent_invoices: InvoiceSummary[];
  pending_invoices: InvoiceSummary[];
}

export interface ReportSummary {
  range: { from: string; to: string };
  totals: {
    billed: Money;
    discount: Money;
    tax: Money;
    invoice_count: number;
    patient_count: number;
    cancelled_count: number;
    collected: Money;
    refunded: Money;
    net_collected: Money;
  };
  by_mode: { mode: PaymentMode; label: string; amount: Money; count: number; refunded: Money }[];
  by_service: { description: string; category: Category; category_label: string; quantity: Money; amount: Money; invoices: number }[];
  by_category: { category: Category; label: string; amount: Money }[];
  daily: DayPoint[];
  outstanding: InvoiceSummary[];
  outstanding_total: Money;
}
