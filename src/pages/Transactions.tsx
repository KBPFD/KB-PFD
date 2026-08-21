import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, ConfirmButton, EmptyState, Field, Modal } from '../components/ui'
import type { Transaction, TxnType } from '../types'
import { formatDate, formatMoney, today } from '../lib/format'
import { downloadCsv } from '../lib/csv'

interface FormState {
  id?: string
  date: string
  type: TxnType
  amount: string
  accountId: string
  toAccountId: string
  category: string
  note: string
}

function blankForm(accountId = ''): FormState {
  return {
    date: today(),
    type: 'expense',
    amount: '',
    accountId,
    toAccountId: '',
    category: '',
    note: '',
  }
}

export function Transactions() {
  const data = useStore((s) => s.data)
  const addTransaction = useStore((s) => s.addTransaction)
  const updateTransaction = useStore((s) => s.updateTransaction)
  const removeTransaction = useStore((s) => s.removeTransaction)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm())
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | TxnType>('all')
  const [monthFilter, setMonthFilter] = useState('')

  const cur = data.currency
  const accountName = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? '—'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.transactions
      .filter((t) => (typeFilter === 'all' ? true : t.type === typeFilter))
      .filter((t) => (monthFilter ? t.date.startsWith(monthFilter) : true))
      .filter((t) =>
        q
          ? t.category.toLowerCase().includes(q) ||
            (t.note ?? '').toLowerCase().includes(q) ||
            accountName(t.accountId).toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  }, [data.transactions, search, typeFilter, monthFilter, data.accounts])

  const totals = useMemo(() => {
    const income = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { income, expense }
  }, [filtered])

  const categories =
    form.type === 'income' ? data.categories.income : form.type === 'expense' ? data.categories.expense : []

  const openNew = () => {
    setForm(blankForm(data.accounts[0]?.id ?? ''))
    setOpen(true)
  }

  const openEdit = (t: Transaction) => {
    setForm({
      id: t.id,
      date: t.date,
      type: t.type,
      amount: String(t.amount),
      accountId: t.accountId,
      toAccountId: t.toAccountId ?? '',
      category: t.category,
      note: t.note ?? '',
    })
    setOpen(true)
  }

  const save = () => {
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) return
    if (!form.accountId) return
    if (form.type === 'transfer' && (!form.toAccountId || form.toAccountId === form.accountId)) return

    const payload: Omit<Transaction, 'id'> = {
      date: form.date,
      type: form.type,
      amount,
      accountId: form.accountId,
      toAccountId: form.type === 'transfer' ? form.toAccountId : undefined,
      category: form.type === 'transfer' ? 'Transfer' : form.category || 'Other',
      note: form.note.trim() || undefined,
    }
    if (form.id) updateTransaction(form.id, payload)
    else addTransaction(payload)
    setOpen(false)
  }

  const exportCsv = () => {
    downloadCsv(
      `transactions-${today()}.csv`,
      ['Date', 'Type', 'Category', 'Account', 'To account', 'Note', 'Amount'],
      filtered.map((t) => [
        t.date,
        t.type,
        t.category,
        accountName(t.accountId),
        t.toAccountId ? accountName(t.toAccountId) : '',
        t.note ?? '',
        t.amount,
      ]),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Transactions</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportCsv} disabled={!filtered.length}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={openNew} disabled={!data.accounts.length}>
            + Add
          </button>
        </div>
      </div>

      {!data.accounts.length && (
        <EmptyState text="Add an account first — every transaction belongs to an account." />
      )}

      <Card>
        <div className="grid gap-2 sm:grid-cols-4">
          <input
            className="field sm:col-span-2"
            placeholder="Search category, note or account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="field"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | TxnType)}
          >
            <option value="all">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
          </select>
          <input
            type="month"
            className="field"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          />
        </div>
        <div className="mt-3 flex gap-4 text-xs text-slate-400">
          <span>{filtered.length} entries</span>
          <span className="text-emerald-400">In {formatMoney(totals.income, cur)}</span>
          <span className="text-rose-400">Out {formatMoney(totals.expense, cur)}</span>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState text="No transactions match your filters." />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="card flex items-center justify-between gap-3 py-3"
              role="button"
              onClick={() => openEdit(t)}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {t.category}
                  {t.note ? <span className="text-slate-500"> · {t.note}</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDate(t.date)} ·{' '}
                  {t.type === 'transfer'
                    ? `${accountName(t.accountId)} → ${accountName(t.toAccountId)}`
                    : accountName(t.accountId)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`whitespace-nowrap text-sm font-semibold ${
                    t.type === 'income'
                      ? 'text-emerald-400'
                      : t.type === 'expense'
                        ? 'text-rose-400'
                        : 'text-slate-300'
                  }`}
                >
                  {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                  {formatMoney(t.amount, cur)}
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  <ConfirmButton onConfirm={() => removeTransaction(t.id)} label="✕" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title={form.id ? 'Edit transaction' : 'New transaction'}
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
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as TxnType, category: '' })}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
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
          <Field label={`Amount (${cur})`}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="field"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label={form.type === 'transfer' ? 'From account' : 'Account'}>
            <select
              className="field"
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            >
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          {form.type === 'transfer' ? (
            <Field label="To account">
              <select
                className="field"
                value={form.toAccountId}
                onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}
              >
                <option value="">Select…</option>
                {data.accounts
                  .filter((a) => a.id !== form.accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <Field label="Category">
              <select
                className="field"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
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
      </Modal>
    </div>
  )
}
