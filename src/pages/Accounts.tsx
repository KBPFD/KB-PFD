import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, ConfirmButton, EmptyState, Field, Modal, Stat } from '../components/ui'
import type { Account, AccountType } from '../types'
import { accountBalance, totalCash } from '../lib/calc'
import { formatMoney } from '../lib/format'

const TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Bank',
  cash: 'Cash',
  credit_card: 'Credit card',
  wallet: 'Wallet / UPI',
  other: 'Other',
}

export function Accounts() {
  const data = useStore((s) => s.data)
  const addAccount = useStore((s) => s.addAccount)
  const updateAccount = useStore((s) => s.updateAccount)
  const removeAccount = useStore((s) => s.removeAccount)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<{ id?: string; name: string; type: AccountType; openingBalance: string }>({
    name: '',
    type: 'bank',
    openingBalance: '0',
  })

  const cur = data.currency

  const openNew = () => {
    setForm({ name: '', type: 'bank', openingBalance: '0' })
    setOpen(true)
  }

  const openEdit = (a: Account) => {
    setForm({ id: a.id, name: a.name, type: a.type, openingBalance: String(a.openingBalance) })
    setOpen(true)
  }

  const save = () => {
    const name = form.name.trim()
    if (!name) return
    const payload = { name, type: form.type, openingBalance: Number(form.openingBalance) || 0 }
    if (form.id) updateAccount(form.id, payload)
    else addAccount(payload)
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Accounts</h1>
        <button className="btn-primary" onClick={openNew}>
          + Add account
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total balance" value={formatMoney(totalCash(data), cur)} />
        <Stat label="Accounts" value={String(data.accounts.length)} />
      </div>

      {data.accounts.length === 0 ? (
        <EmptyState
          text="No accounts yet. Add your bank, cash and credit card accounts to get started."
          action={
            <button className="btn-primary" onClick={openNew}>
              Add your first account
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.accounts.map((a) => {
            const balance = accountBalance(a, data.transactions)
            return (
              <Card key={a.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-slate-500">{TYPE_LABEL[a.type]}</p>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(a)}>
                      Edit
                    </button>
                    <ConfirmButton onConfirm={() => removeAccount(a.id)} label="✕" />
                  </div>
                </div>
                <p
                  className={`mt-3 text-xl font-semibold ${balance < 0 ? 'text-rose-400' : 'text-slate-100'}`}
                >
                  {formatMoney(balance, cur)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Opening {formatMoney(a.openingBalance, cur)} ·{' '}
                  {data.transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length}{' '}
                  transactions
                </p>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={open}
        title={form.id ? 'Edit account' : 'New account'}
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
        <div className="grid gap-3">
          <Field label="Name">
            <input
              className="field"
              value={form.name}
              maxLength={60}
              placeholder="HDFC Savings"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Type">
            <select
              className="field"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
            >
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Opening balance (${cur})`}>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="field"
              value={form.openingBalance}
              onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
            />
          </Field>
          <p className="text-xs text-slate-500">
            For credit cards, enter the outstanding amount as a negative number.
          </p>
        </div>
      </Modal>
    </div>
  )
}
