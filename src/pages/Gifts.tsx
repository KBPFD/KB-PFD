import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, ConfirmButton, EmptyState, Field, Modal, Stat } from '../components/ui'
import type { GiftEntry, GiftKind } from '../types'
import { formatDate, formatMoney, today } from '../lib/format'
import { downloadCsv } from '../lib/csv'

const KIND_LABEL: Record<GiftKind, string> = {
  given: 'Gift given',
  received: 'Gift received',
  donation: 'Donation',
}

const KIND_STYLE: Record<GiftKind, string> = {
  given: 'bg-rose-900/40 text-rose-300',
  received: 'bg-emerald-900/40 text-emerald-300',
  donation: 'bg-brand-900/50 text-brand-300',
}

/** Indian financial year label for a date, e.g. 2026-05-02 -> "2026-27". */
function financialYear(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  const start = m >= 4 ? y : y - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

interface FormState {
  id?: string
  date: string
  kind: GiftKind
  party: string
  occasion: string
  amount: string
  item: string
  taxDeductible: boolean
  receiptNo: string
  note: string
}

function blankForm(): FormState {
  return {
    date: today(),
    kind: 'given',
    party: '',
    occasion: '',
    amount: '',
    item: '',
    taxDeductible: false,
    receiptNo: '',
    note: '',
  }
}

export function Gifts() {
  const data = useStore((s) => s.data)
  const addGift = useStore((s) => s.addGift)
  const updateGift = useStore((s) => s.updateGift)
  const removeGift = useStore((s) => s.removeGift)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm())
  const [kindFilter, setKindFilter] = useState<'all' | GiftKind>('all')
  const [yearFilter, setYearFilter] = useState(financialYear(today()))

  const cur = data.currency

  const years = useMemo(() => {
    const set = new Set(data.gifts.map((g) => financialYear(g.date)))
    set.add(financialYear(today()))
    return [...set].sort().reverse()
  }, [data.gifts])

  const inYear = useMemo(
    () => data.gifts.filter((g) => financialYear(g.date) === yearFilter),
    [data.gifts, yearFilter],
  )

  const list = useMemo(
    () =>
      inYear
        .filter((g) => (kindFilter === 'all' ? true : g.kind === kindFilter))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [inYear, kindFilter],
  )

  const totalFor = (kind: GiftKind) =>
    inYear.filter((g) => g.kind === kind).reduce((s, g) => s + g.amount, 0)
  const deductible = inYear
    .filter((g) => g.kind === 'donation' && g.taxDeductible)
    .reduce((s, g) => s + g.amount, 0)

  const openNew = () => {
    setForm(blankForm())
    setOpen(true)
  }

  const openEdit = (g: GiftEntry) => {
    setForm({
      id: g.id,
      date: g.date,
      kind: g.kind,
      party: g.party,
      occasion: g.occasion ?? '',
      amount: String(g.amount),
      item: g.item ?? '',
      taxDeductible: g.taxDeductible ?? false,
      receiptNo: g.receiptNo ?? '',
      note: g.note ?? '',
    })
    setOpen(true)
  }

  const save = () => {
    const party = form.party.trim()
    if (!party) return
    const payload: Omit<GiftEntry, 'id'> = {
      date: form.date || today(),
      kind: form.kind,
      party,
      occasion: form.occasion.trim() || undefined,
      amount: Number(form.amount) || 0,
      item: form.item.trim() || undefined,
      taxDeductible: form.kind === 'donation' ? form.taxDeductible : undefined,
      receiptNo: form.receiptNo.trim() || undefined,
      note: form.note.trim() || undefined,
    }
    if (form.id) updateGift(form.id, payload)
    else addGift(payload)
    setOpen(false)
  }

  const exportCsv = () =>
    downloadCsv(
      `gifts-donations-${yearFilter}.csv`,
      ['Date', 'Type', 'Party', 'Occasion', 'Amount', 'Item', 'Tax deductible', 'Receipt', 'Note'],
      list.map((g) => [
        g.date,
        KIND_LABEL[g.kind],
        g.party,
        g.occasion ?? '',
        g.amount,
        g.item ?? '',
        g.taxDeductible ? 'Yes' : '',
        g.receiptNo ?? '',
        g.note ?? '',
      ]),
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Gifts & donations</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportCsv} disabled={!list.length}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={openNew}>
            + Add entry
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Gifts given · FY ${yearFilter}`} value={formatMoney(totalFor('given'), cur)} tone="bad" />
        <Stat label="Gifts received" value={formatMoney(totalFor('received'), cur)} tone="good" />
        <Stat label="Donations" value={formatMoney(totalFor('donation'), cur)} />
        <Stat label="Tax deductible" value={formatMoney(deductible, cur)} hint="donations marked 80G" />
      </div>

      {data.gifts.length === 0 ? (
        <EmptyState
          text="Keep a register of gifts you give and receive, and of charitable donations with their receipts."
          action={
            <button className="btn-primary" onClick={openNew}>
              Add your first entry
            </button>
          }
        />
      ) : (
        <Card
          title="Register"
          action={
            <div className="flex gap-2">
              <select
                className="field w-auto py-1 text-xs"
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as 'all' | GiftKind)}
              >
                <option value="all">All types</option>
                {Object.entries(KIND_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                className="field w-auto py-1 text-xs"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    FY {y}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {list.length === 0 ? (
            <EmptyState text="Nothing recorded for this filter." />
          ) : (
            <div className="space-y-2">
              {list.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 p-3"
                  role="button"
                  onClick={() => openEdit(g)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {g.party}
                      <span className={`chip ml-2 ${KIND_STYLE[g.kind]}`}>{KIND_LABEL[g.kind]}</span>
                      {g.taxDeductible && (
                        <span className="chip ml-2 bg-slate-800 text-slate-300">80G</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(g.date)}
                      {g.occasion ? ` · ${g.occasion}` : ''}
                      {g.item ? ` · ${g.item}` : ''}
                      {g.receiptNo ? ` · receipt ${g.receiptNo}` : ''}
                    </p>
                    {g.note && <p className="mt-1 text-xs text-slate-600">{g.note}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`whitespace-nowrap text-sm font-semibold ${
                        g.kind === 'received' ? 'text-emerald-400' : 'text-slate-200'
                      }`}
                    >
                      {formatMoney(g.amount, cur)}
                    </span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <ConfirmButton onConfirm={() => removeGift(g.id)} label="✕" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        open={open}
        title={form.id ? 'Edit entry' : 'New gift or donation'}
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
          <Field label="Type">
            <select
              className="field"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as GiftKind })}
            >
              {Object.entries(KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              className="field"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label={form.kind === 'donation' ? 'Organisation' : 'Person / family'}>
            <input
              className="field"
              value={form.party}
              maxLength={60}
              placeholder={form.kind === 'donation' ? 'Temple trust / NGO' : 'Name'}
              onChange={(e) => setForm({ ...form, party: e.target.value })}
            />
          </Field>
          <Field label={`Amount (${cur})`}>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="field"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="Occasion">
            <input
              className="field"
              value={form.occasion}
              maxLength={60}
              placeholder="Wedding / birthday / festival"
              onChange={(e) => setForm({ ...form, occasion: e.target.value })}
            />
          </Field>
          <Field label="Item (if not cash)">
            <input
              className="field"
              value={form.item}
              maxLength={60}
              onChange={(e) => setForm({ ...form, item: e.target.value })}
            />
          </Field>
          {form.kind === 'donation' && (
            <>
              <Field label="Receipt number">
                <input
                  className="field"
                  value={form.receiptNo}
                  maxLength={40}
                  onChange={(e) => setForm({ ...form, receiptNo: e.target.value })}
                />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.taxDeductible}
                  onChange={(e) => setForm({ ...form, taxDeductible: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                />
                Tax deductible (80G)
              </label>
            </>
          )}
          <Field label="Note" className="sm:col-span-2">
            <input
              className="field"
              value={form.note}
              maxLength={140}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          This is a register. If money actually moved through a bank account, log it on the
          Transactions tab too so balances stay correct.
        </p>
      </Modal>
    </div>
  )
}
