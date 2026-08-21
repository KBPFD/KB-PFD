import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, ConfirmButton, EmptyState, Field, Modal, Stat } from '../components/ui'
import type { BillFrequency, RecurringBill } from '../types'
import { billDueDate } from '../lib/calc'
import { addMonths, formatDate, formatMoney, monthKey, today } from '../lib/format'

const FREQ_LABEL: Record<BillFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

const INTERVAL: Record<BillFrequency, number> = { monthly: 1, quarterly: 3, yearly: 12 }

function nextDueMonth(bill: RecurringBill): string {
  const current = monthKey()
  if (!bill.lastPaidMonth) return current
  const next = addMonths(bill.lastPaidMonth, INTERVAL[bill.frequency])
  return next < current && bill.frequency === 'monthly' ? current : next
}

interface FormState {
  id?: string
  name: string
  amount: string
  category: string
  dueDay: string
  frequency: BillFrequency
  accountId: string
  active: boolean
}

function blankForm(data: { categories: { expense: string[] }; accounts: { id: string }[] }): FormState {
  return {
    name: '',
    amount: '',
    category: data.categories.expense[0] ?? 'Other',
    dueDay: '1',
    frequency: 'monthly',
    accountId: data.accounts[0]?.id ?? '',
    active: true,
  }
}

export function Bills() {
  const data = useStore((s) => s.data)
  const addBill = useStore((s) => s.addBill)
  const updateBill = useStore((s) => s.updateBill)
  const removeBill = useStore((s) => s.removeBill)
  const addTransaction = useStore((s) => s.addTransaction)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm(data))
  const cur = data.currency
  const todayIso = today()

  const rows = useMemo(
    () =>
      data.bills
        .map((b) => {
          const dueMonth = nextDueMonth(b)
          const dueDate = billDueDate(b.dueDay, dueMonth)
          const daysLeft = Math.round(
            (new Date(dueDate).getTime() - new Date(todayIso).getTime()) / 86_400_000,
          )
          return { bill: b, dueMonth, dueDate, daysLeft }
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [data.bills, todayIso],
  )

  const activeRows = rows.filter((r) => r.bill.active)
  const monthlyOutgo = data.bills
    .filter((b) => b.active)
    .reduce((s, b) => s + b.amount / INTERVAL[b.frequency], 0)
  const overdue = activeRows.filter((r) => r.daysLeft < 0)
  const dueSoon = activeRows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 7)

  const openNew = () => {
    setForm(blankForm(data))
    setOpen(true)
  }

  const openEdit = (b: RecurringBill) => {
    setForm({
      id: b.id,
      name: b.name,
      amount: String(b.amount),
      category: b.category,
      dueDay: String(b.dueDay),
      frequency: b.frequency,
      accountId: b.accountId ?? '',
      active: b.active,
    })
    setOpen(true)
  }

  const save = () => {
    const name = form.name.trim()
    if (!name) return
    const payload: Omit<RecurringBill, 'id'> = {
      name,
      amount: Number(form.amount) || 0,
      category: form.category || 'Other',
      dueDay: Math.min(Math.max(Number(form.dueDay) || 1, 1), 31),
      frequency: form.frequency,
      accountId: form.accountId || undefined,
      active: form.active,
    }
    if (form.id) updateBill(form.id, payload)
    else addBill(payload)
    setOpen(false)
  }

  const markPaid = (bill: RecurringBill, dueMonth: string, dueDate: string) => {
    if (bill.accountId) {
      addTransaction({
        date: dueDate > todayIso ? todayIso : dueDate,
        type: 'expense',
        amount: bill.amount,
        accountId: bill.accountId,
        category: bill.category,
        note: `${bill.name} (recurring)`,
      })
    }
    updateBill(bill.id, { lastPaidMonth: dueMonth })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Recurring bills</h1>
        <button className="btn-primary" onClick={openNew}>
          + Add bill
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Avg monthly outgo" value={formatMoney(monthlyOutgo, cur)} />
        <Stat label="Active bills" value={String(activeRows.length)} />
        <Stat label="Overdue" value={String(overdue.length)} tone={overdue.length ? 'bad' : 'default'} />
        <Stat label="Due in 7 days" value={String(dueSoon.length)} />
      </div>

      {data.bills.length === 0 ? (
        <EmptyState
          text="Add rent, EMIs, subscriptions and insurance premiums so nothing slips through."
          action={
            <button className="btn-primary" onClick={openNew}>
              Add your first bill
            </button>
          }
        />
      ) : (
        <Card title="Upcoming">
          <div className="space-y-2">
            {rows.map(({ bill, dueMonth, dueDate, daysLeft }) => {
              const tone = !bill.active
                ? 'border-slate-800 opacity-50'
                : daysLeft < 0
                  ? 'border-rose-900/60 bg-rose-950/20'
                  : daysLeft <= 7
                    ? 'border-amber-900/60 bg-amber-950/20'
                    : 'border-slate-800'
              return (
                <div key={bill.id} className={`rounded-xl border p-3 ${tone}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{bill.name}</p>
                      <p className="text-xs text-slate-500">
                        {FREQ_LABEL[bill.frequency]} · {bill.category} · due {formatDate(dueDate)}
                        {bill.active
                          ? daysLeft < 0
                            ? ` · ${Math.abs(daysLeft)} days overdue`
                            : ` · in ${daysLeft} days`
                          : ' · paused'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatMoney(bill.amount, cur)}</span>
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => markPaid(bill, dueMonth, dueDate)}
                        disabled={!bill.active}
                        title={bill.accountId ? 'Logs an expense and moves the due date' : 'Moves the due date'}
                      >
                        Mark paid
                      </button>
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(bill)}>
                        Edit
                      </button>
                      <ConfirmButton onConfirm={() => removeBill(bill.id)} label="✕" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <Modal
        open={open}
        title={form.id ? 'Edit bill' : 'New recurring bill'}
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
          <Field label="Name" className="sm:col-span-2">
            <input
              className="field"
              value={form.name}
              maxLength={60}
              placeholder="Rent / Netflix / Car insurance"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label={`Amount (${cur})`}>
            <input
              type="number"
              inputMode="decimal"
              className="field"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="Frequency">
            <select
              className="field"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value as BillFrequency })}
            >
              {Object.entries(FREQ_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due day of month">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="31"
              className="field"
              value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
            />
          </Field>
          <Field label="Category">
            <select
              className="field"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {data.categories.expense.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pay from account">
            <select
              className="field"
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            >
              <option value="">Don't auto-log an expense</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900"
            />
            Active
          </label>
        </div>
      </Modal>
    </div>
  )
}
