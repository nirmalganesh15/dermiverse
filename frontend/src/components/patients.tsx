import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Search, UserPlus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, ApiError, qs } from "../lib/api";
import { initials } from "../lib/format";
import type { Paginated, Patient } from "../lib/types";
import { Combobox, useDebounced } from "./Combobox";
import { Field, Modal, Segmented, Spinner } from "./ui";

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-100 to-gold-200 font-semibold text-gold-800 ring-1 ring-gold-300/60"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function patientMeta(p: Patient) {
  return [p.uhid, p.phone, p.age != null ? `${p.age} yrs` : "", p.gender_label].filter(Boolean).join(" · ");
}

/** Search by name, phone or patient ID; or add a new patient without leaving the invoice. */
export function PatientPicker({
  value,
  onChange,
  error,
  autoFocus,
}: {
  value: Patient | null;
  onChange: (p: Patient | null) => void;
  error?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const term = useDebounced(text.trim());
  const results = useQuery({
    queryKey: ["patients", term],
    queryFn: () => api<Paginated<Patient>>(`/patients/${qs({ q: term, page_size: 8 })}`),
    enabled: !value,
    staleTime: 10_000,
  });

  if (value) {
    return (
      <div className="flex items-center gap-3.5 rounded-xl border border-gold-300 bg-gold-50/60 px-4 py-3">
        <Avatar name={value.name} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[1.02rem] font-semibold">{value.name}</div>
          <div className="truncate text-[0.86rem] text-ink-2">{patientMeta(value)}</div>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(null)}>
          <X size={16} aria-hidden /> Change
        </button>
      </div>
    );
  }

  const looksLikePhone = /^\+?\d[\d\s-]{3,}$/.test(text.trim());
  return (
    <>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-[1.35rem] z-10 -translate-y-1/2 text-ink-3" aria-hidden />
        <Combobox
          value={text}
          onChange={setText}
          options={results.data?.results ?? []}
          loading={results.isFetching && !results.data}
          getKey={(p) => p.id}
          onSelect={(p) => {
            onChange(p);
            setText("");
          }}
          emptyText={term ? "No patient found with that name or number." : "Start typing a name or mobile number."}
          renderOption={(p) => (
            <div className="flex items-center gap-3">
              <Avatar name={p.name} size={34} />
              <div className="min-w-0">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-[0.82rem] text-ink-3">{patientMeta(p)}</div>
              </div>
            </div>
          )}
          action={{
            label: (
              <span className="flex items-center gap-2">
                <UserPlus size={17} aria-hidden /> {text.trim() ? `Add “${text.trim()}” as a new patient` : "Add a new patient"}
              </span>
            ),
            onSelect: () => setAdding(true),
          }}
          inputProps={{
            className: "input !h-11 !pl-10",
            placeholder: "Search name, mobile or patient ID",
            "aria-label": "Patient",
            "aria-invalid": error ? true : undefined,
            autoFocus,
          }}
        />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <AddPatientModal
        open={adding}
        onOpenChange={setAdding}
        initial={looksLikePhone ? { phone: text.trim() } : { name: text.trim() }}
        onCreated={(p) => {
          onChange(p);
          setText("");
        }}
      />
    </>
  );
}

type Draft = { name: string; phone: string; gender: "" | "F" | "M" | "O"; age_years: string; email: string; address: string };

export function AddPatientModal({
  open,
  onOpenChange,
  initial,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<Draft>;
  onCreated: (p: Patient) => void;
}) {
  const qc = useQueryClient();
  const blank: Draft = { name: "", phone: "", gender: "", age_years: "", email: "", address: "" };
  const [form, setForm] = useState<Draft>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm({ ...blank, ...initial });
      setErrors({});
    }
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      api<Patient>("/patients/", {
        method: "POST",
        json: { ...form, age_years: form.age_years ? Number(form.age_years) : null },
      }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success(`${p.name} added`, { description: `Patient ID ${p.uhid}` });
      onCreated(p);
      onOpenChange(false);
    },
    onError: (e) => setErrors(e instanceof ApiError ? { ...e.fields, _: e.message } : { _: (e as Error).message }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "Enter the patient's full name.";
    if (form.phone.replace(/\D/g, "").length < 10) errs.phone = "Enter a 10-digit mobile number.";
    if (form.age_years && (Number(form.age_years) < 0 || Number(form.age_years) > 120)) errs.age_years = "Enter a valid age.";
    setErrors(errs);
    if (!Object.keys(errs).length) create.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add new patient"
      description="Only name and mobile number are needed to start billing."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" form="add-patient" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? <Spinner /> : <UserPlus size={17} aria-hidden />} Add patient
          </button>
        </>
      }
    >
      <form id="add-patient" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Full name" error={errors.name} className="sm:col-span-2">
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={!form.name} />
        </Field>
        <Field label="Mobile number" error={errors.phone} htmlFor="patient-phone">
          <div className="relative">
            <Phone size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              id="patient-phone"
              className="input !pl-10"
              inputMode="tel"
              value={form.phone}
              aria-invalid={errors.phone ? true : undefined}
              onChange={(e) => set("phone", e.target.value)}
              data-autofocus={Boolean(form.name) && !form.phone ? "" : undefined}
            />
          </div>
        </Field>
        <Field label="Age" optional error={errors.age_years}>
          <input
            className="input"
            inputMode="numeric"
            value={form.age_years}
            onChange={(e) => set("age_years", e.target.value.replace(/\D/g, "").slice(0, 3))}
          />
        </Field>
        <div className="sm:col-span-2">
          <div className="field-label" id="gender-label">
            Gender <span className="font-normal text-ink-3">(optional)</span>
          </div>
          <Segmented
            name="gender"
            label="Gender"
            value={form.gender}
            onChange={(v) => set("gender", v)}
            options={[
              { value: "F", label: "Female" },
              { value: "M", label: "Male" },
              { value: "O", label: "Other" },
            ]}
          />
        </div>
        <Field label="Email" optional error={errors.email}>
          <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Area / address" optional>
          <input className="input" value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        {errors._ && !errors.name && !errors.phone && (
          <p role="alert" className="field-error sm:col-span-2">
            {errors._}
          </p>
        )}
      </form>
    </Modal>
  );
}
