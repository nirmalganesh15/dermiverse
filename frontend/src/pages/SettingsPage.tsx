import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Building2, Check, FileText, Lock, Plus, Stethoscope, Upload } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Field, Modal, PageHeader, Pill, SkeletonRows, Spinner } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth, useClinic } from "../lib/auth";
import type { ClinicSettings, Doctor } from "../lib/types";

const TABS = [
  { key: "clinic", label: "Clinic profile", icon: Building2 },
  { key: "invoice", label: "Invoice & tax", icon: FileText },
  { key: "doctors", label: "Doctors", icon: Stethoscope },
] as const;

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("clinic");
  const canEdit = Boolean(user?.can_manage);
  return (
    <div>
      <PageHeader title="Settings" subtitle="Clinic details shown on invoices and receipts." />
      {!canEdit && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-line bg-cream px-4 py-3 text-[0.92rem] text-ink-2">
          <Lock size={16} aria-hidden /> Only the doctor or an administrator can change settings.
        </div>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div role="tablist" aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              onClick={() => setTab(t.key)}
              className={clsx(
                "flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-left text-[0.93rem] font-medium transition",
                tab === t.key ? "bg-white text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : "text-ink-2 hover:bg-sand",
              )}
            >
              <t.icon size={17} className={tab === t.key ? "text-gold-700" : "text-ink-3"} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "doctors" ? <DoctorsPanel canEdit={canEdit} /> : <ClinicForm section={tab} canEdit={canEdit} />}
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card card-pad">
      <h2 className="t-title">{title}</h2>
      {description && <p className="mt-1 text-[0.92rem] text-ink-2">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ClinicForm({ section, canEdit }: { section: "clinic" | "invoice"; canEdit: boolean }) {
  const qc = useQueryClient();
  const clinic = useClinic();
  const [draft, setDraft] = useState<Partial<ClinicSettings>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<File | null>(null);
  const save = useMutationSave(qc, () => {
    setDraft({});
    setSignature(null);
  }, setErrors);
  if (!clinic.data) return <div className="card"><SkeletonRows rows={6} cols={2} /></div>;
  const v = { ...clinic.data, ...draft };
  const set = (k: keyof ClinicSettings, value: string | boolean) => setDraft((d) => ({ ...d, [k]: value }));
  const dirty = Object.keys(draft).length > 0 || signature;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (signature) {
      const fd = new FormData();
      for (const [k, val] of Object.entries(draft)) fd.append(k, String(val));
      fd.append("signature", signature);
      save.mutate(fd);
    } else save.mutate(draft);
  };

  const text = (k: keyof ClinicSettings, label: string, opts: { hint?: string; optional?: boolean; className?: string } = {}) => (
    <Field label={label} hint={opts.hint} optional={opts.optional} error={errors[k]} className={opts.className}>
      <input className="input" value={String(v[k] ?? "")} disabled={!canEdit} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );
  const area = (k: keyof ClinicSettings, label: string, hint?: string, optional = true) => (
    <Field label={label} hint={hint} optional={optional} error={errors[k]} className="sm:col-span-2">
      <textarea className="input" rows={3} value={String(v[k] ?? "")} disabled={!canEdit} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );
  const toggle = (k: keyof ClinicSettings, label: string, desc: string) => (
    <label className={clsx("flex items-start gap-3 rounded-xl border border-line-strong px-4 py-3 sm:col-span-2", canEdit && "cursor-pointer")}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-gold-600)]" checked={Boolean(v[k])} disabled={!canEdit} onChange={(e) => set(k, e.target.checked)} />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-[0.85rem] text-ink-3">{desc}</span>
      </span>
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      {section === "clinic" ? (
        <>
          <Section title="Clinic identity" description="Printed at the top of every invoice and receipt.">
            <div className="grid gap-4 sm:grid-cols-2">
              {text("name", "Clinic name", { className: "sm:col-span-2" })}
              {text("subtitle", "Speciality line", { hint: "Shown under the clinic name" })}
              {text("tagline", "Tagline", { optional: true })}
              {area("address", "Full address", undefined, false)}
              {text("state", "State", { hint: "Used for GST (CGST + SGST)" })}
              {text("working_hours", "Working hours", { optional: true })}
            </div>
          </Section>
          <Section title="Contact">
            <div className="grid gap-4 sm:grid-cols-2">
              {text("phone", "Phone")}
              {text("whatsapp", "WhatsApp", { optional: true })}
              {text("email", "Email", { optional: true })}
              {text("website", "Website / Instagram", { optional: true })}
              {text("google_business", "Google Business name", { optional: true, className: "sm:col-span-2" })}
            </div>
          </Section>
          <Section title="Registration">
            <div className="grid gap-4 sm:grid-cols-2">
              {text("gstin", "GSTIN", { optional: true, hint: "When set, invoices are titled “Tax Invoice”" })}
              {text("registration_no", "Clinic registration / licence no.", { optional: true })}
            </div>
          </Section>
        </>
      ) : (
        <>
          <Section title="Invoice numbering" description="Numbers are sequential and never reused, even for cancelled invoices.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prefix" error={errors.invoice_prefix} hint={`Next invoices look like ${v.invoice_prefix || "DV"}-${new Date().getFullYear()}-0042`}>
                <input className="input" maxLength={10} value={v.invoice_prefix} disabled={!canEdit} onChange={(e) => set("invoice_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
              </Field>
            </div>
          </Section>
          <Section title="Amounts">
            <div className="grid gap-4 sm:grid-cols-2">
              {toggle("round_off_total", "Round totals to the nearest rupee", "E.g. ₹2,654.60 becomes ₹2,655.00, with the round-off shown on the invoice.")}
              {toggle("show_doctor_registration", "Show doctor's registration number", "Printed under the doctor's name on invoices.")}
            </div>
          </Section>
          <Section title="Printed text">
            <div className="grid gap-4 sm:grid-cols-2">
              {area("invoice_terms", "Terms & conditions", "One point per line.")}
              {area("refund_policy", "Cancellation & refund policy")}
              {text("invoice_footer", "Thank-you line", { optional: true, className: "sm:col-span-2" })}
              <div className="sm:col-span-2">
                <div className="field-label">Signature or clinic stamp <span className="font-normal text-ink-3">(optional)</span></div>
                <div className="flex flex-wrap items-center gap-4">
                  {v.signature && <img src={v.signature} alt="Current signature" className="h-14 rounded-lg border border-line bg-white p-1" />}
                  {canEdit && (
                    <label className="btn btn-secondary btn-sm cursor-pointer">
                      <Upload size={15} aria-hidden /> {signature ? signature.name : "Upload image"}
                      <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => setSignature(e.target.files?.[0] ?? null)} />
                    </label>
                  )}
                  <span className="text-[0.82rem] text-ink-3">PNG with transparent background works best.</span>
                </div>
              </div>
            </div>
          </Section>
        </>
      )}
      {canEdit && (
        <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-2xl border border-line bg-white/95 px-5 py-3 shadow-[var(--shadow-pop)] backdrop-blur">
          {errors._ && <span className="field-error !mt-0 mr-auto">{errors._}</span>}
          <span className="text-[0.88rem] text-ink-3">{dirty ? "You have unsaved changes" : "All changes saved"}</span>
          <button type="button" className="btn btn-secondary" disabled={!dirty} onClick={() => { setDraft({}); setSignature(null); }}>
            Discard
          </button>
          <button type="submit" className="btn btn-primary" disabled={!dirty || save.isPending}>
            {save.isPending ? <Spinner /> : <Check size={17} aria-hidden />} Save changes
          </button>
        </div>
      )}
    </form>
  );
}

function useMutationSave(qc: ReturnType<typeof useQueryClient>, done: () => void, setErrors: (e: Record<string, string>) => void) {
  return useMutation({
    mutationFn: (body: Partial<ClinicSettings> | FormData) =>
      body instanceof FormData
        ? api<ClinicSettings>("/clinic/", { method: "PATCH", body })
        : api<ClinicSettings>("/clinic/", { method: "PATCH", json: body }),
    onSuccess: (data) => {
      qc.setQueryData(["clinic"], data);
      setErrors({});
      done();
      toast.success("Settings saved");
    },
    onError: (e) => setErrors(e instanceof ApiError ? { ...e.fields, _: e.message } : { _: "Could not save." }),
  });
}

function DoctorsPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["doctors"], queryFn: () => api<Doctor[]>("/doctors/") });
  const [editing, setEditing] = useState<Doctor | "new" | null>(null);
  const [form, setForm] = useState({ name: "", qualification: "", registration_no: "", is_default: false, is_active: true });
  const [err, setErr] = useState("");
  const open = (d: Doctor | "new") => {
    setEditing(d);
    setErr("");
    setForm(d === "new" ? { name: "", qualification: "", registration_no: "", is_default: false, is_active: true } : { ...d });
  };
  const save = useMutation({
    mutationFn: () =>
      editing === "new"
        ? api<Doctor>("/doctors/", { method: "POST", json: form })
        : api<Doctor>(`/doctors/${(editing as Doctor).id}/`, { method: "PATCH", json: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctors"] });
      toast.success("Doctor saved");
      setEditing(null);
    },
    onError: (e) => setErr((e as Error).message),
  });

  return (
    <Section title="Doctors" description="Shown on invoices as the consulting doctor.">
      {list.isLoading ? (
        <SkeletonRows rows={2} cols={2} />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {(list.data ?? []).map((d) => (
            <li key={d.id} className="flex items-center gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {d.name}
                  {d.is_default && <Pill tone="gold">Default</Pill>}
                  {!d.is_active && <Pill>Inactive</Pill>}
                </div>
                <div className="text-[0.86rem] text-ink-3">
                  {[d.qualification, d.registration_no && `Reg. ${d.registration_no}`].filter(Boolean).join(" · ")}
                </div>
              </div>
              {canEdit && (
                <button className="btn btn-sm btn-ghost" onClick={() => open(d)}>
                  Edit
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <button className="btn btn-secondary btn-sm mt-4" onClick={() => open("new")}>
          <Plus size={16} aria-hidden /> Add doctor
        </button>
      )}
      <Modal
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        size="sm"
        title={editing === "new" ? "Add doctor" : "Edit doctor"}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={save.isPending || !form.name.trim()} onClick={() => save.mutate()}>
              {save.isPending && <Spinner />} Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Full name" error={err || undefined}>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Qualifications" optional>
            <input className="input" value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} />
          </Field>
          <Field label="Medical registration no." optional>
            <input className="input" value={form.registration_no} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} />
          </Field>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-gold-600)]" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            Selected by default on new invoices
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-gold-600)]" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
        </div>
      </Modal>
    </Section>
  );
}
