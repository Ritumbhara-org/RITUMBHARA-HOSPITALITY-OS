"use client"

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, Check, Loader2, Save } from "lucide-react"
import { saveLongStayBooking } from "@/app/actions/long-stay"
import {
  aboutMonths, balanceDue, DEFAULT_DEPOSIT_TERMS, formatInr, ID_TYPES, idLast4, INCLUSIONS, nightsBetween, PAYMENT_MODES,
  PROPERTY_TYPES, propertyTypeForUnitType, RATE_TYPES, refundToGuest, STATUSES, suggestedTotal, validateLongStay,
  type LongStayErrors, type LongStayInput,
} from "@/lib/long-stay/shared"
import type { LongStayFormProps } from "@/lib/long-stay/view"
import { MediaUploader } from "./media-uploader"
import { AgreementPanel } from "./agreement-panel"
import { StatusBadge } from "./badges"

const inputClass =
  "h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20 read-only:bg-muted/40"

// Fields whose change voids a signed agreement (mirrors materialKey in lib/long-stay/agreement.ts).
function materialOf(f: LongStayInput): string {
  return JSON.stringify([
    f.guestName.trim(), f.idType, idLast4(f.idNumber), f.propertyId, f.unitId || null, f.propertyType, f.checkIn, f.checkOut,
    f.inclusion, f.rateType, Number(f.rate) || 0, Number(f.totalAmount) || 0, Number(f.advancePaid) || 0, Number(f.securityDeposit) || 0,
    f.depositTerms.replace(/\r\n/g, "\n").trim(),
  ])
}

function numberOr0(v: string): number {
  if (v.trim() === "") return 0
  return Number(v)
}

export function LongStayForm({ mode, initial, initialStatus, locations, units, agreement, createdAt }: LongStayFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<LongStayInput>(initial)
  const [baseline, setBaseline] = useState<LongStayInput>(initial)
  const [errors, setErrors] = useState<LongStayErrors>({})
  const [saving, setSaving] = useState(false)
  const nights = nightsBetween(form.checkIn, form.checkOut)
  const suggested = suggestedTotal(form.rateType, Number(form.rate) || 0, nights)
  const [totalTouched, setTotalTouched] = useState(mode === "edit" && initial.totalAmount !== suggestedTotal(initial.rateType, initial.rate, nightsBetween(initial.checkIn, initial.checkOut)))

  const saved = mode === "edit"
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)
  const signed = agreement?.badge === "SIGNED"
  const materialChanged = materialOf(form) !== materialOf(baseline)
  const unitsHere = useMemo(() => units.filter((u) => u.propertyId === form.propertyId), [units, form.propertyId])

  function set<K extends keyof LongStayInput>(key: K, value: LongStayInput[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      // Keep the total in step with the rate and dates until staff type their own.
      if (!totalTouched && (key === "rate" || key === "rateType" || key === "checkIn" || key === "checkOut")) {
        next.totalAmount = suggestedTotal(next.rateType, Number(next.rate) || 0, nightsBetween(next.checkIn, next.checkOut))
      }
      return next
    })
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function chooseLocation(propertyId: string) {
    setForm((f) => ({ ...f, propertyId, unitId: units.some((u) => u.id === f.unitId && u.propertyId === propertyId) ? f.unitId : "" }))
    setErrors((e) => ({ ...e, propertyId: undefined, unitId: undefined }))
  }

  function chooseUnit(unitId: string) {
    const unit = units.find((u) => u.id === unitId)
    const type = propertyTypeForUnitType(unit?.type)
    setForm((f) => ({ ...f, unitId, propertyType: type ?? f.propertyType }))
    setErrors((e) => ({ ...e, unitId: undefined, propertyType: type ? undefined : e.propertyType }))
  }

  async function onSave() {
    const errs = validateLongStay(form)
    if (form.unitId && !unitsHere.some((u) => u.id === form.unitId)) errs.unitId = "This unit doesn't belong to the chosen location"
    const wasIn = initialStatus === "CHECKED_IN" || initialStatus === "CHECKED_OUT"
    if ((form.status === "CHECKED_IN" || form.status === "CHECKED_OUT") && !wasIn && (!signed || materialChanged)) {
      errs.status = signed ? "These changes void the signed agreement. Send it for e-sign again before check-in." : "The guest has to e-sign the agreement before check-in"
    }
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error("Please fix the highlighted fields.")
      document.querySelector(`[data-field="${Object.keys(errs)[0]}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    setSaving(true)
    const r = await saveLongStayBooking(form)
    setSaving(false)
    if (!r.success) {
      setErrors(r.errors ?? {})
      toast.error(r.error)
      return
    }
    setBaseline(form)
    if (r.voidedSignature) toast.warning("Saved. The guest's signature was voided because the agreement changed — send it for e-sign again.")
    else toast.success(mode === "new" ? "Booking created" : "Booking saved")
    if (mode === "new") router.replace(`/long-stay/${r.id}`)
    else router.refresh()
  }

  const months = aboutMonths(nights)
  const err = (k: keyof LongStayInput) => errors[k]

  return (
    <div className="flex flex-col flex-1 w-full gap-5 pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/long-stay" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-card hover:bg-muted" aria-label="Back to Long Stays">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{mode === "new" ? "New long stay" : baseline.guestName || "Long stay"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {mode === "new" ? "Monthly or extended stay booked directly." : `Booking ${initial.id.slice(-8)}${createdAt ? ` · created ${createdAt}` : ""}`}
            </p>
          </div>
        </div>
        {mode === "edit" && <StatusBadge status={baseline.status} />}
      </div>

      <Section title="Guest">
        <Grid>
          <Field label="Guest name" required error={err("guestName")} name="guestName">
            <input className={inputClass} value={form.guestName} onChange={(e) => set("guestName", e.target.value)} aria-invalid={!!err("guestName")} autoComplete="off" />
          </Field>
          <Field label="Contact number" required error={err("contactNumber")} name="contactNumber" hint="WhatsApp number. Used for the e-sign link and OTP.">
            <input className={inputClass} type="tel" inputMode="tel" placeholder="+91 98765 43210" value={form.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} aria-invalid={!!err("contactNumber")} />
          </Field>
          <Field label="Alternate number" error={err("altContactNumber")} name="altContactNumber">
            <input className={inputClass} type="tel" inputMode="tel" value={form.altContactNumber} onChange={(e) => set("altContactNumber", e.target.value)} aria-invalid={!!err("altContactNumber")} />
          </Field>
          <Field label="Email" error={err("email")} name="email">
            <input className={inputClass} type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!err("email")} />
          </Field>
          <Field label="No. of guests" error={err("occupants")} name="occupants">
            <input className={inputClass} type="number" min={1} step={1} value={form.occupants} onChange={(e) => set("occupants", Math.trunc(numberOr0(e.target.value)))} aria-invalid={!!err("occupants")} />
          </Field>
          <Field label="Emergency contact" error={err("emergencyContact")} name="emergencyContact">
            <input className={inputClass} placeholder="Name and number" value={form.emergencyContact} onChange={(e) => set("emergencyContact", e.target.value)} />
          </Field>
          <Field label="Guest ID type" required error={err("idType")} name="idType">
            <select className={inputClass} value={form.idType} onChange={(e) => set("idType", e.target.value)} aria-invalid={!!err("idType")}>
              <option value="">Select…</option>
              {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Guest ID number" required error={err("idNumber")} name="idNumber">
            <input className={inputClass} value={form.idNumber} onChange={(e) => set("idNumber", e.target.value)} aria-invalid={!!err("idNumber")} autoComplete="off" />
          </Field>
        </Grid>
        <div className="mt-5">
          <MediaUploader
            bookingId={form.id} kind="id" saved={saved} paths={form.idDocuments} onChange={(p) => set("idDocuments", p)}
            accept="image/*,application/pdf" label="Guest ID copy" hint="Photo or PDF, front and back."
          />
        </div>
      </Section>

      <Section title="Stay">
        <Grid>
          <Field label="Location" required error={err("propertyId")} name="propertyId">
            <select className={inputClass} value={form.propertyId} onChange={(e) => chooseLocation(e.target.value)} aria-invalid={!!err("propertyId")}>
              <option value="">Select location…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Unit" error={err("unitId")} name="unitId" hint={form.propertyId && unitsHere.length === 0 ? "No units at this location." : undefined}>
            <select className={inputClass} value={form.unitId} onChange={(e) => chooseUnit(e.target.value)} disabled={!form.propertyId} aria-invalid={!!err("unitId")}>
              <option value="">{form.propertyId ? "No specific unit" : "Pick a location first"}</option>
              {unitsHere.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.type}</option>)}
            </select>
          </Field>
          <Field label="Property type" required error={err("propertyType")} name="propertyType">
            <select className={inputClass} value={form.propertyType} onChange={(e) => set("propertyType", e.target.value)} aria-invalid={!!err("propertyType")}>
              <option value="">Select…</option>
              {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Status" error={err("status")} name="status">
            <select className={inputClass} value={form.status} onChange={(e) => set("status", e.target.value)} aria-invalid={!!err("status")}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Check-in" required error={err("checkIn")} name="checkIn">
            <input className={inputClass} type="date" value={form.checkIn} onChange={(e) => set("checkIn", e.target.value)} aria-invalid={!!err("checkIn")} />
          </Field>
          <Field label="Check-out" required error={err("checkOut")} name="checkOut">
            <input className={inputClass} type="date" min={form.checkIn || undefined} value={form.checkOut} onChange={(e) => set("checkOut", e.target.value)} aria-invalid={!!err("checkOut")} />
          </Field>
          <Field label="No. of nights" name="nights">
            <div className="flex h-10 items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 text-sm">
              <span className="font-semibold">{nights}</span>
              {months && <span className="text-muted-foreground">· {months}</span>}
            </div>
          </Field>
        </Grid>
      </Section>

      <Section title="Inclusions" required error={err("inclusion")} name="inclusion">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Inclusion">
          {INCLUSIONS.map((i) => {
            const active = form.inclusion === i.value
            return (
              <button
                type="button" key={i.value} role="radio" aria-checked={active} onClick={() => set("inclusion", i.value)}
                className={`relative rounded-xl border p-4 text-left transition-all ${active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border/60 bg-background hover:bg-muted/40"}`}
              >
                {active && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
                <div className="pr-6 text-sm font-semibold">{i.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{i.description}</div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Price">
        <Grid>
          <Field label="Rate type" error={err("rateType")} name="rateType">
            <div className="grid grid-cols-2 gap-2">
              {RATE_TYPES.map((r) => (
                <button
                  type="button" key={r.value} onClick={() => set("rateType", r.value)}
                  className={`h-10 rounded-xl border text-sm font-medium ${form.rateType === r.value ? "border-primary bg-primary/5 text-primary" : "border-border/60 bg-background hover:bg-muted/40"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Rate (₹ ${form.rateType === "PER_NIGHT" ? "per night" : "per month"})`} error={err("rate")} name="rate">
            <MoneyInput value={form.rate} onChange={(v) => set("rate", v)} invalid={!!err("rate")} />
          </Field>
          <Field
            label="Total amount (₹)" error={err("totalAmount")} name="totalAmount"
            hint={
              suggested > 0 && Number(form.totalAmount) !== suggested ? (
                <span>
                  Suggested {formatInr(suggested)} ·{" "}
                  <button type="button" className="font-semibold text-primary hover:underline" onClick={() => { setTotalTouched(false); set("totalAmount", suggested) }}>
                    Use suggested
                  </button>
                </span>
              ) : suggested > 0 ? "Matches the suggested total." : undefined
            }
          >
            <MoneyInput value={form.totalAmount} onChange={(v) => { setTotalTouched(true); set("totalAmount", v) }} invalid={!!err("totalAmount")} />
          </Field>
          <Field label="Advance paid (₹)" error={err("advancePaid")} name="advancePaid">
            <MoneyInput value={form.advancePaid} onChange={(v) => set("advancePaid", v)} invalid={!!err("advancePaid")} />
          </Field>
          <Field label="Payment mode" error={err("paymentMode")} name="paymentMode">
            <select className={inputClass} value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)}>
              <option value="">Select…</option>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Balance due" name="balance">
            <div className="flex h-10 items-center rounded-xl border border-border/60 bg-muted/40 px-3 text-sm font-semibold">
              {formatInr(balanceDue(form.totalAmount, form.advancePaid))}
            </div>
          </Field>
        </Grid>
      </Section>

      <Section title="Security deposit">
        <Grid>
          <Field label="Deposit amount (₹)" error={err("securityDeposit")} name="securityDeposit">
            <MoneyInput value={form.securityDeposit} onChange={(v) => set("securityDeposit", v)} invalid={!!err("securityDeposit")} />
          </Field>
          <Field label="Deposit paid via" error={err("depositMode")} name="depositMode">
            <select className={inputClass} value={form.depositMode} onChange={(e) => set("depositMode", e.target.value)}>
              <option value="">Select…</option>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </Grid>
        <div className="mt-4" data-field="depositTerms">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="text-sm font-medium" htmlFor="depositTerms">Terms and conditions</label>
            {form.depositTerms !== DEFAULT_DEPOSIT_TERMS && (
              <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => set("depositTerms", DEFAULT_DEPOSIT_TERMS)}>
                Reset to default
              </button>
            )}
          </div>
          <textarea
            id="depositTerms" rows={9} value={form.depositTerms} onChange={(e) => set("depositTerms", e.target.value)}
            className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          />
          <p className="mt-1 text-xs text-muted-foreground">The guest accepts these terms by e-signing the agreement.</p>
        </div>

        {mode === "edit" && (
          <div className="mt-5 rounded-xl border border-dashed p-4">
            <p className="mb-3 text-sm font-semibold">At check-out</p>
            <Grid>
              <Field label="Deduction at check-out (₹)" error={err("depositDeduction")} name="depositDeduction">
                <MoneyInput value={form.depositDeduction} onChange={(v) => set("depositDeduction", v)} invalid={!!err("depositDeduction")} />
              </Field>
              <Field label="Reason for deduction" error={err("deductionReason")} name="deductionReason">
                <input className={inputClass} value={form.deductionReason} onChange={(e) => set("deductionReason", e.target.value)} placeholder="e.g. broken lamp, extra cleaning" />
              </Field>
              <Field label="Refunded on" error={err("depositRefundedOn")} name="depositRefundedOn">
                <input className={inputClass} type="date" value={form.depositRefundedOn} onChange={(e) => set("depositRefundedOn", e.target.value)} aria-invalid={!!err("depositRefundedOn")} />
              </Field>
              <Field label="Refund to guest" name="refund">
                <div className="flex h-10 items-center rounded-xl border border-border/60 bg-muted/40 px-3 text-sm font-semibold">
                  {formatInr(refundToGuest(form.securityDeposit, form.depositDeduction))}
                </div>
              </Field>
            </Grid>
          </div>
        )}
      </Section>

      <Section title="E-sign agreement">
        {mode === "new" ? (
          <p className="text-sm text-muted-foreground">Save the booking first. Then send the agreement to the guest for e-sign.</p>
        ) : (
          <AgreementPanel bookingId={form.id} agreement={agreement} dirty={dirty} materialChanged={signed && materialChanged} contactNumber={baseline.contactNumber} />
        )}
      </Section>

      <Section title="Photos and videos">
        <div className="space-y-6">
          <MediaUploader
            bookingId={form.id} kind="checkin" saved={saved} paths={form.checkInMedia} onChange={(p) => set("checkInMedia", p)}
            accept="image/*,video/*" label="Just before check-in" hint="Every room, fittings, appliances and meter readings."
          />
          <MediaUploader
            bookingId={form.id} kind="checkout" saved={saved} paths={form.checkOutMedia} onChange={(p) => set("checkOutMedia", p)}
            accept="image/*,video/*" label="Right after check-out" hint="Record the same angles as at check-in."
          />
        </div>
      </Section>

      <Section title="Notes">
        <textarea
          rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything the team should know"
          className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        />
      </Section>

      <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 mt-2 border-t bg-background/95 px-4 sm:px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2 min-w-0">
            {signed && materialChanged ? (
              <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Saving will void the guest&apos;s signature.</span>
            ) : dirty ? "Unsaved changes" : mode === "edit" ? "All changes saved" : ""}
          </div>
          <div className="flex gap-2">
            <Link href="/long-stay" className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium hover:bg-muted">Close</Link>
            <button
              type="button" onClick={onSave} disabled={saving || (mode === "edit" && !dirty)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {mode === "new" ? "Create booking" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, required, error, name }: { title: string; children: ReactNode; required?: boolean; error?: string; name?: string }) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm" data-field={name}>
      <h2 className="mb-4 text-base font-semibold">
        {title}
        {required && <span className="text-destructive"> *</span>}
      </h2>
      {children}
      {error && <p className="mt-2 text-xs font-medium text-destructive">{error}</p>}
    </section>
  )
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}

function Field({ label, required, error, hint, name, children }: { label: string; required?: boolean; error?: string; hint?: ReactNode; name: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5" data-field={name}>
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function MoneyInput({ value, onChange, invalid }: { value: number; onChange: (v: number) => void; invalid?: boolean }) {
  const [text, setText] = useState(value ? String(value) : "")
  // Follow outside changes (e.g. "Use suggested") without fighting the user's typing.
  const shown = numberOr0(text) === value || (text === "" && value === 0) ? text : String(value)
  return (
    <input
      className={inputClass} type="number" inputMode="decimal" min={0} step="any" placeholder="0" value={shown} aria-invalid={invalid}
      onChange={(e) => {
        setText(e.target.value)
        const n = numberOr0(e.target.value)
        onChange(Number.isFinite(n) ? n : NaN)
      }}
    />
  )
}
