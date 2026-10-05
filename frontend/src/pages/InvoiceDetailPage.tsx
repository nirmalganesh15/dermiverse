import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FilePlus2,
  MessageCircle,
  MoreHorizontal,
  Printer,
  Receipt,
  RotateCcw,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import logo from "../assets/logo-mark.png";
import { CancelInvoiceModal, ReceivePaymentModal, RefundModal } from "../components/billingModals";
import { patientMeta } from "../components/patients";
import { Amount, ErrorNote, KeyValue, Pill, SkeletonRows, StatusBadge } from "../components/ui";
import { api, openPdf } from "../lib/api";
import { useAuth, useClinic } from "../lib/auth";
import { fmtDateTime, plainNumber, rupees } from "../lib/format";
import type { ClinicSettings, Invoice } from "../lib/types";

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const clinic = useClinic();
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundWithCancel, setRefundWithCancel] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const navigate = useNavigate();
  const [justCreated, setJustCreated] = useState(Boolean((location.state as { justCreated?: boolean } | null)?.justCreated));
  // Show the "created" banner once; don't bring it back on refresh.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api<Invoice>(`/invoices/${id}/`) });
  if (q.isError) return <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) return <div className="card"><SkeletonRows rows={8} /></div>;
  const inv = q.data;
  const due = Number(inv.balance_due) > 0;
  const cancelled = inv.status === "CANCELLED";
  const canManage = user?.can_manage;

  const pdf = (mode: "view" | "print" | "download") =>
    openPdf(`/invoices/${inv.id}/pdf/`, mode, `${inv.number}.pdf`).catch((e) => toast.error((e as Error).message));

  const whatsapp = () => {
    const c = clinic.data;
    const lines = [
      `Hello ${inv.patient_name},`,
      `Thank you for visiting ${c?.name ?? "our clinic"}.`,
      ``,
      `Invoice: ${inv.number}`,
      `Date: ${fmtDateTime(inv.invoice_date)}`,
      `Total: ${rupees(inv.total)}`,
      `Paid: ${rupees(inv.amount_paid)}`,
      ...(due ? [`Balance due: ${rupees(inv.balance_due)}`] : []),
      ``,
      c?.phone ? `For any queries, call ${c.phone}.` : "",
    ];
    const phone = inv.patient_phone.replace(/\D/g, "");
    const intl = phone.length === 10 ? `91${phone}` : phone;
    window.open(`https://wa.me/${intl}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");
  };

  return (
    <div>
      <Link to="/invoices" className="mb-4 inline-flex items-center gap-1.5 text-[0.9rem] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> All invoices
      </Link>

      {justCreated && (
        <div role="status" className="mb-6 flex flex-col gap-3 rounded-2xl border border-success/25 bg-success-bg px-5 py-4 sm:flex-row sm:items-center">
          <CheckCircle2 size={22} className="shrink-0 text-success" aria-hidden />
          <div className="flex-1">
            <div className="font-semibold text-success">Invoice created successfully</div>
            <div className="text-[0.9rem] text-ink-2">Print it, share it on WhatsApp, or start the next bill.</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-ghost" onClick={() => setJustCreated(false)}>
              Dismiss
            </button>
            <Link to="/invoices/new" className="btn btn-sm btn-primary">
              <FilePlus2 size={16} aria-hidden /> Next invoice
            </Link>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="t-overline mb-2 text-gold-700">Invoice · {fmtDateTime(inv.invoice_date)}</div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="t-display">{inv.number}</h1>
            <StatusBadge status={inv.payment_status} />
            {Number(inv.amount_refunded) > 0 && <Pill tone="info">Refunded {rupees(inv.amount_refunded)}</Pill>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => pdf("print")}>
            <Printer size={17} aria-hidden /> Print
          </button>
          <button className="btn btn-secondary" onClick={() => pdf("download")}>
            <Download size={17} aria-hidden /> PDF
          </button>
          <button className="btn btn-secondary" onClick={whatsapp}>
            <MessageCircle size={17} aria-hidden /> WhatsApp
          </button>
          {canManage && !cancelled && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="btn btn-secondary !px-3" aria-label="More actions">
                <MoreHorizontal size={18} />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="anim-pop z-50 min-w-52 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]">
                  <DropdownMenu.Item
                    disabled={Number(inv.refundable_amount) <= 0}
                    onSelect={() => {
                      setRefundWithCancel(false);
                      setRefundOpen(true);
                    }}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[0.92rem] outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-cream data-[disabled]:opacity-45"
                  >
                    <RotateCcw size={16} aria-hidden /> Refund payment
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => setCancelOpen(true)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[0.92rem] text-danger outline-none data-[highlighted]:bg-danger-bg"
                  >
                    <XCircle size={16} aria-hidden /> Cancel invoice
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </div>

      {/* What to do next */}
      {due && (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gold-300 bg-gradient-to-r from-gold-50 to-white px-5 py-4 sm:flex-row sm:items-center">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-gold-700 ring-1 ring-gold-300">
            <Wallet size={21} aria-hidden />
          </div>
          <div className="flex-1">
            <div className="text-[0.88rem] text-ink-2">Balance due from {inv.patient_name}</div>
            <div className="t-num text-[1.6rem] font-semibold leading-tight">{rupees(inv.balance_due)}</div>
          </div>
          <button className="btn btn-gold btn-lg" onClick={() => setPayOpen(true)}>
            <Wallet size={18} aria-hidden /> Receive payment
          </button>
        </div>
      )}
      {cancelled && (
        <div role="note" className="mb-6 flex items-start gap-3 rounded-2xl border border-line-strong bg-neutral-bg px-5 py-4">
          <XCircle size={20} className="mt-0.5 shrink-0 text-neutral" aria-hidden />
          <div>
            <div className="font-semibold">This invoice was cancelled</div>
            <div className="text-[0.9rem] text-ink-2">
              {inv.cancelled_at && fmtDateTime(inv.cancelled_at)}
              {inv.cancelled_by_name && ` by ${inv.cancelled_by_name}`}. Reason: {inv.cancel_reason}
            </div>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <InvoicePaper inv={inv} clinic={clinic.data} />

        <div className="space-y-6">
          <section className="card card-pad" aria-labelledby="pt-h">
            <h2 id="pt-h" className="t-overline mb-3">Patient</h2>
            <div className="text-[1.05rem] font-semibold">{inv.patient_name}</div>
            <div className="mt-0.5 text-[0.88rem] text-ink-2">{patientMeta(inv.patient_detail)}</div>
            {inv.doctor_detail && (
              <div className="mt-4 border-t border-line pt-4">
                <div className="t-overline mb-1">Doctor</div>
                <div className="font-medium">{inv.doctor_detail.name}</div>
                {inv.doctor_detail.qualification && <div className="text-[0.86rem] text-ink-3">{inv.doctor_detail.qualification}</div>}
              </div>
            )}
          </section>

          <section className="card card-pad" aria-labelledby="pay-h">
            <h2 id="pay-h" className="t-overline mb-2">Payment summary</h2>
            <dl className="text-[0.95rem]">
              <KeyValue label="Invoice total">{rupees(inv.total)}</KeyValue>
              <KeyValue label="Paid">{rupees(inv.amount_paid)}</KeyValue>
              {Number(inv.amount_refunded) > 0 && <KeyValue label="Refunded">− {rupees(inv.amount_refunded)}</KeyValue>}
              <div className="my-2 h-px bg-line" />
              <KeyValue label="Balance due" strong>
                <span className={clsx(due && "text-danger")}>{rupees(inv.balance_due)}</span>
              </KeyValue>
            </dl>
          </section>

          <section className="card" aria-labelledby="hist-h">
            <h2 id="hist-h" className="t-overline px-6 pb-2 pt-5">Payment history</h2>
            {inv.payments.length === 0 && inv.refunds.length === 0 ? (
              <p className="px-6 pb-5 text-[0.92rem] text-ink-3">No payments recorded yet.</p>
            ) : (
              <ol className="px-6 pb-4">
                {[
                  ...inv.payments.map((p) => ({ kind: "pay" as const, at: p.paid_at, p })),
                  ...inv.refunds.map((r) => ({ kind: "ref" as const, at: r.refunded_at, r })),
                ]
                  .sort((a, b) => a.at.localeCompare(b.at))
                  .map((e) =>
                    e.kind === "pay" ? (
                      <li key={`p${e.p.id}`} className="relative flex gap-3 border-l-2 border-line py-2.5 pl-4">
                        <span className="absolute -left-[7px] top-4 h-3 w-3 rounded-full bg-success ring-2 ring-white" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium">{e.p.mode_label} received</span>
                            <Amount value={e.p.amount} className="font-semibold text-success" />
                          </div>
                          <div className="text-[0.8rem] text-ink-3">
                            {fmtDateTime(e.p.paid_at)} · {e.p.receipt_number}
                            {e.p.reference && ` · Ref ${e.p.reference}`}
                          </div>
                          <button
                            className="mt-1 inline-flex items-center gap-1 text-[0.8rem] font-medium text-gold-700 hover:underline"
                            onClick={() => openPdf(`/payments/${e.p.id}/pdf/`, "view", `${e.p.receipt_number}.pdf`).catch(() => toast.error("Could not open receipt"))}
                          >
                            <Receipt size={13} aria-hidden /> Receipt
                          </button>
                        </div>
                      </li>
                    ) : (
                      <li key={`r${e.r.id}`} className="relative flex gap-3 border-l-2 border-line py-2.5 pl-4">
                        <span className="absolute -left-[7px] top-4 h-3 w-3 rounded-full bg-info ring-2 ring-white" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium">Refund · {e.r.mode_label}</span>
                            <Amount value={`-${e.r.amount}`} className="font-semibold text-info" />
                          </div>
                          <div className="text-[0.8rem] text-ink-3">
                            {fmtDateTime(e.r.refunded_at)} · {e.r.refund_number}
                          </div>
                          <div className="text-[0.82rem] text-ink-2">“{e.r.reason}”</div>
                        </div>
                      </li>
                    ),
                  )}
              </ol>
            )}
          </section>

          <p className="px-1 text-[0.8rem] text-ink-3">
            Created {fmtDateTime(inv.created_at)}
            {inv.created_by_name && ` by ${inv.created_by_name}`}
          </p>
        </div>
      </div>

      <ReceivePaymentModal invoice={inv} open={payOpen} onOpenChange={setPayOpen} />
      <RefundModal invoice={inv} open={refundOpen} onOpenChange={setRefundOpen} startWithCancel={refundWithCancel} />
      <CancelInvoiceModal
        invoice={inv}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onNeedRefund={() => {
          setRefundWithCancel(true);
          setRefundOpen(true);
        }}
      />
    </div>
  );
}

/** On-screen version of the printed invoice, same structure as the PDF. */
function InvoicePaper({ inv, clinic }: { inv: Invoice; clinic?: ClinicSettings }) {
  const showDisc = Number(inv.discount_total) > 0;
  const showTax = Number(inv.tax_total) > 0;
  const half = Number(inv.tax_total) / 2;
  return (
    <article className="card relative overflow-hidden" aria-label={`Invoice ${inv.number}`}>
      <div className="h-1.5 bg-gradient-to-r from-gold-600 via-gold-300 to-gold-600" aria-hidden />
      <div className="p-6 sm:p-9">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <img src={logo} alt="" className="h-14 w-auto" />
            <div>
              <div className="font-display text-[1.65rem] font-semibold leading-tight">{clinic?.name ?? "Dermverse"}</div>
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-gold-700">{clinic?.subtitle}</div>
            </div>
          </div>
          <div className="text-[0.86rem] text-ink-2 sm:text-right">
            <div className="max-w-[16rem] sm:ml-auto">{clinic?.address}</div>
            <div>{clinic?.phone && `Ph ${clinic.phone}`}</div>
            {clinic?.gstin && <div>GSTIN {clinic.gstin}</div>}
          </div>
        </header>
        <div className="gold-rule my-6" />

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <div className="t-overline mb-1">Billed to</div>
            <div className="font-semibold">{inv.patient_name}</div>
            <div className="text-[0.86rem] text-ink-2">
              {inv.patient_uhid} · {inv.patient_phone}
            </div>
          </div>
          <div>
            <div className="t-overline mb-1">Invoice</div>
            <div className="font-semibold">{inv.number}</div>
            <div className="text-[0.86rem] text-ink-2">{fmtDateTime(inv.invoice_date)}</div>
          </div>
          {inv.doctor_detail && (
            <div>
              <div className="t-overline mb-1">Doctor</div>
              <div className="font-semibold">{inv.doctor_detail.name}</div>
              <div className="text-[0.86rem] text-ink-2">{inv.doctor_detail.qualification}</div>
            </div>
          )}
        </div>

        <div className="-mx-6 mt-7 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[34rem] text-[0.92rem]">
            <caption className="sr-only">Items billed</caption>
            <thead>
              <tr className="border-b-2 border-ink text-left">
                <th scope="col" className="t-overline py-2 pl-6 pr-2 sm:pl-0">Treatment / product</th>
                <th scope="col" className="t-overline px-2 py-2 text-right">Qty</th>
                <th scope="col" className="t-overline px-2 py-2 text-right">Rate</th>
                {showDisc && <th scope="col" className="t-overline px-2 py-2 text-right">Discount</th>}
                {showTax && <th scope="col" className="t-overline px-2 py-2 text-right">GST</th>}
                <th scope="col" className="t-overline py-2 pl-2 pr-6 text-right sm:pr-0">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it) => (
                <tr key={it.id} className="border-b border-line align-top">
                  <td className="py-3 pl-6 pr-2 sm:pl-0">
                    <div className="font-medium">{it.description}</div>
                    {it.details && <div className="text-[0.82rem] text-ink-3">{it.details}</div>}
                  </td>
                  <td className="t-num px-2 py-3 text-right">{plainNumber(it.quantity)}</td>
                  <td className="t-num px-2 py-3 text-right">{rupees(it.unit_price)}</td>
                  {showDisc && (
                    <td className="t-num px-2 py-3 text-right">
                      {Number(it.discount_amount) ? (
                        <>
                          −{rupees(it.discount_amount)}
                          {it.discount_type === "PERCENT" && <div className="text-[0.76rem] text-ink-3">{plainNumber(it.discount_value)}%</div>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {showTax && (
                    <td className="t-num px-2 py-3 text-right">
                      {Number(it.tax_amount) ? (
                        <>
                          {rupees(it.tax_amount)}
                          <div className="text-[0.76rem] text-ink-3">@{plainNumber(it.tax_rate)}%</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  <td className="t-num py-3 pl-2 pr-6 text-right font-semibold sm:pr-0">{rupees(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div className="max-w-sm text-[0.88rem]">
            {inv.notes && (
              <>
                <div className="t-overline mb-1">Notes</div>
                <p className="whitespace-pre-line text-ink-2">{inv.notes}</p>
              </>
            )}
          </div>
          <dl className="w-full text-[0.94rem] sm:w-72">
            <KeyValue label="Subtotal">{rupees(inv.subtotal)}</KeyValue>
            {showDisc && <KeyValue label="Discount">− {rupees(inv.discount_total)}</KeyValue>}
            {showTax && (
              <>
                <KeyValue label="CGST">{rupees(half)}</KeyValue>
                <KeyValue label="SGST">{rupees(Number(inv.tax_total) - half)}</KeyValue>
              </>
            )}
            {Number(inv.round_off) !== 0 && <KeyValue label="Round off">{rupees(inv.round_off)}</KeyValue>}
            <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink pt-3">
              <dt className="font-semibold">Total</dt>
              <dd className="t-num font-display text-[1.75rem] font-semibold leading-none">{rupees(inv.total)}</dd>
            </div>
          </dl>
        </div>
      </div>
      {inv.status === "CANCELLED" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="-rotate-[24deg] rounded-xl border-4 border-danger/25 px-6 py-2 text-[3.5rem] font-bold tracking-widest text-danger/15">
            CANCELLED
          </span>
        </div>
      )}
    </article>
  );
}
