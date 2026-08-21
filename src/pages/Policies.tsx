import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, ConfirmButton, EmptyState, Field, Modal, Stat } from '../components/ui'
import type { Policy, PolicyCategory, PolicyStatus, PremiumFrequency } from '../types'
import { formatDate, formatMoney } from '../lib/format'
import { downloadCsv } from '../lib/csv'

const CATEGORIES: PolicyCategory[] = [
  'LIC',
  'Health Insurance',
  'Life Insurance',
  'Term Insurance',
  'Vehicle Insurance',
  'Accident Insurance',
  'Travel Insurance',
  'Other',
]

const FREQUENCIES: PremiumFrequency[] = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-time']
const STATUSES: PolicyStatus[] = ['Active', 'Due Soon', 'Lapsed', 'Closed']

const PER_YEAR: Record<PremiumFrequency, number> = {
  Monthly: 12,
  Quarterly: 4,
  'Half-Yearly': 2,
  Yearly: 1,
  'One-time': 0,
}

const STATUS_STYLE: Record<PolicyStatus, string> = {
  Active: 'bg-emerald-900/40 text-emerald-300',
  'Due Soon': 'bg-amber-900/40 text-amber-300',
  Lapsed: 'bg-rose-900/40 text-rose-300',
  Closed: 'bg-slate-800 text-slate-400',
}

interface FormState {
  id?: string
  category: PolicyCategory
  provider: string
  name: string
  policyNumber: string
  holder: string
  nominee: string
  startDate: string
  endDate: string
  premium: string
  frequency: PremiumFrequency
  sumAssured: string
  status: PolicyStatus
  note: string
}

function blankForm(): FormState {
  return {
    category: 'LIC',
    provider: '',
    name: '',
    policyNumber: '',
    holder: '',
    nominee: '',
    startDate: '',
    endDate: '',
    premium: '',
    frequency: 'Yearly',
    sumAssured: '',
    status: 'Active',
    note: '',
  }
}

export function Policies() {
  const data = useStore((s) => s.data)
  const addPolicy = useStore((s) => s.addPolicy)
  const updatePolicy = useStore((s) => s.updatePolicy)
  const removePolicy = useStore((s) => s.removePolicy)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm())
  const [filter, setFilter] = useState<'all' | PolicyCategory>('all')
  const [showClosed, setShowClosed] = useState(false)

  const cur = data.currency

  const list = useMemo(
    () =>
      data.policies
        .filter((p) => (filter === 'all' ? true : p.category === filter))
        .filter((p) => (showClosed ? true : p.status !== 'Closed'))
        .sort((a, b) => b.sumAssured - a.sumAssured),
    [data.policies, filter, showClosed],
  )

  const active = data.policies.filter((p) => p.status !== 'Closed' && p.status !== 'Lapsed')
  const totalCover = active.reduce((s, p) => s + p.sumAssured, 0)
  const annualPremium = active.reduce((s, p) => s + p.premium * PER_YEAR[p.frequency], 0)

  const openNew = () => {
    setForm(blankForm())
    setOpen(true)
  }

  const openEdit = (p: Policy) => {
    setForm({
      id: p.id,
      category: p.category,
      provider: p.provider,
      name: p.name,
      policyNumber: p.policyNumber ?? '',
      holder: p.holder ?? '',
      nominee: p.nominee ?? '',
      startDate: p.startDate ?? '',
      endDate: p.endDate ?? '',
      premium: String(p.premium),
      frequency: p.frequency,
      sumAssured: String(p.sumAssured),
      status: p.status,
      note: p.note ?? '',
    })
    setOpen(true)
  }

  const save = () => {
    const name = form.name.trim()
    if (!name) return
    const payload: Omit<Policy, 'id'> = {
      category: form.category,
      provider: form.provider.trim(),
      name,
      policyNumber: form.policyNumber.trim() || undefined,
      holder: form.holder.trim() || undefined,
      nominee: form.nominee.trim() || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      premium: Number(form.premium) || 0,
      frequency: form.frequency,
      sumAssured: Number(form.sumAssured) || 0,
      status: form.status,
      note: form.note.trim() || undefined,
    }
    if (form.id) updatePolicy(form.id, payload)
    else addPolicy(payload)
    setOpen(false)
  }

  const exportCsv = () =>
    downloadCsv(
      'policies.csv',
      [
        'Category',
        'Provider',
        'Policy',
        'Number',
        'Holder',
        'Nominee',
        'Start',
        'End / Maturity',
        'Premium',
        'Frequency',
        'Cover',
        'Status',
        'Notes',
      ],
      list.map((p) => [
        p.category,
        p.provider,
        p.name,
        p.policyNumber ?? '',
        p.holder ?? '',
        p.nominee ?? '',
        p.startDate ?? '',
        p.endDate ?? '',
        p.premium,
        p.frequency,
        p.sumAssured,
        p.status,
        p.note ?? '',
      ]),
    )

  const endLabel = (value?: string) => {
    if (!value) return '—'
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Insurance policies</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportCsv} disabled={!list.length}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={openNew}>
            + Add policy
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total cover" value={formatMoney(totalCover, cur)} />
        <Stat label="Annual premium" value={formatMoney(annualPremium, cur)} />
        <Stat label="Active policies" value={String(active.length)} />
        <Stat label="All policies" value={String(data.policies.length)} />
      </div>

      {data.policies.length === 0 ? (
        <EmptyState
          text="Track LIC, health, term and accident policies with premiums, cover, nominee and renewal status."
          action={
            <button className="btn-primary" onClick={openNew}>
              Add your first policy
            </button>
          }
        />
      ) : (
        <Card
          title="Policies"
          action={
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={showClosed}
                  onChange={(e) => setShowClosed(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900"
                />
                Show closed
              </label>
              <select
                className="field w-auto py-1 text-xs"
                value={filter}
                onChange={(e) => setFilter(e.target.value as 'all' | PolicyCategory)}
              >
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <div className="space-y-2">
            {list.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-slate-800 p-3"
                role="button"
                onClick={() => openEdit(p)}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {p.name}
                      <span className={`chip ml-2 ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {p.category} · {p.provider || '—'}
                      {p.policyNumber ? ` · #${p.policyNumber}` : ''}
                      {p.holder ? ` · ${p.holder}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Cover {formatMoney(p.sumAssured, cur)} · maturity {endLabel(p.endDate)}
                      {p.nominee ? ` · nominee ${p.nominee}` : ''}
                    </p>
                    {p.note && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{p.note}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatMoney(p.premium, cur)}</p>
                      <p className="text-xs text-slate-500">{p.frequency}</p>
                    </div>
                    <span onClick={(e) => e.stopPropagation()}>
                      <ConfirmButton onConfirm={() => removePolicy(p.id)} label="✕" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={open}
        title={form.id ? 'Edit policy' : 'New policy'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save}>
              Save
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Policy name" className="sm:col-span-2">
            <input
              className="field"
              value={form.name}
              maxLength={80}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Category">
            <select
              className="field"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as PolicyCategory })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Provider">
            <input
              className="field"
              value={form.provider}
              maxLength={60}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
            />
          </Field>
          <Field label="Policy number">
            <input
              className="field"
              value={form.policyNumber}
              maxLength={40}
              onChange={(e) => setForm({ ...form, policyNumber: e.target.value })}
            />
          </Field>
          <Field label="Policy holder">
            <input
              className="field"
              value={form.holder}
              maxLength={60}
              onChange={(e) => setForm({ ...form, holder: e.target.value })}
            />
          </Field>
          <Field label="Nominee">
            <input
              className="field"
              value={form.nominee}
              maxLength={80}
              onChange={(e) => setForm({ ...form, nominee: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <select
              className="field"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as PolicyStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date">
            <input
              type="date"
              className="field"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </Field>
          <Field label="End / maturity">
            <input
              className="field"
              value={form.endDate}
              placeholder="yyyy-mm-dd or e.g. Matured"
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>
          <Field label={`Premium (${cur})`}>
            <input
              type="number"
              inputMode="decimal"
              className="field"
              value={form.premium}
              onChange={(e) => setForm({ ...form, premium: e.target.value })}
            />
          </Field>
          <Field label="Frequency">
            <select
              className="field"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value as PremiumFrequency })}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Sum assured / cover (${cur})`} className="sm:col-span-2">
            <input
              type="number"
              inputMode="decimal"
              className="field"
              value={form.sumAssured}
              onChange={(e) => setForm({ ...form, sumAssured: e.target.value })}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className="field h-20"
              value={form.note}
              maxLength={300}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
