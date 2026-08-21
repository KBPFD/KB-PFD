import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, ConfirmButton, EmptyState, Field, Modal, Stat } from '../components/ui'
import type { Loan } from '../types'
import { emiFor, loanMonthsRemaining, totalLoanOutstanding } from '../lib/calc'
import { formatDate, formatMoney, today } from '../lib/format'

interface FormState {
  id?: string
  name: string
  lender: string
  principal: string
  outstanding: string
  interestRate: string
  emi: string
  startDate: string
  tenureMonths: string
}

function blankForm(): FormState {
  return {
    name: '',
    lender: '',
    principal: '',
    outstanding: '',
    interestRate: '',
    emi: '',
    startDate: today(),
    tenureMonths: '',
  }
}

export function Loans() {
  const data = useStore((s) => s.data)
  const addLoan = useStore((s) => s.addLoan)
  const updateLoan = useStore((s) => s.updateLoan)
  const removeLoan = useStore((s) => s.removeLoan)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm())
  const cur = data.currency

  const totalEmi = data.loans.reduce((s, l) => s + l.emi, 0)
  const outstanding = totalLoanOutstanding(data)
  const totalPrincipal = data.loans.reduce((s, l) => s + l.principal, 0)

  const openNew = () => {
    setForm(blankForm())
    setOpen(true)
  }

  const openEdit = (l: Loan) => {
    setForm({
      id: l.id,
      name: l.name,
      lender: l.lender ?? '',
      principal: String(l.principal),
      outstanding: String(l.outstanding),
      interestRate: String(l.interestRate),
      emi: String(l.emi),
      startDate: l.startDate,
      tenureMonths: String(l.tenureMonths),
    })
    setOpen(true)
  }

  const suggestEmi = () => {
    const emi = emiFor(Number(form.principal) || 0, Number(form.interestRate) || 0, Number(form.tenureMonths) || 0)
    setForm({ ...form, emi: emi ? emi.toFixed(2) : '' })
  }

  const save = () => {
    const name = form.name.trim()
    if (!name) return
    const payload: Omit<Loan, 'id'> = {
      name,
      lender: form.lender.trim() || undefined,
      principal: Number(form.principal) || 0,
      outstanding: Number(form.outstanding) || 0,
      interestRate: Number(form.interestRate) || 0,
      emi: Number(form.emi) || 0,
      startDate: form.startDate || today(),
      tenureMonths: Number(form.tenureMonths) || 0,
    }
    if (form.id) updateLoan(form.id, payload)
    else addLoan(payload)
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Loans</h1>
        <button className="btn-primary" onClick={openNew}>
          + Add loan
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Outstanding" value={formatMoney(outstanding, cur)} tone={outstanding > 0 ? 'bad' : 'default'} />
        <Stat label="Monthly EMI" value={formatMoney(totalEmi, cur)} />
        <Stat label="Originally borrowed" value={formatMoney(totalPrincipal, cur)} />
        <Stat
          label="Repaid"
          value={formatMoney(Math.max(totalPrincipal - outstanding, 0), cur)}
          tone="good"
        />
      </div>

      {data.loans.length === 0 ? (
        <EmptyState
          text="No loans tracked. Add home, car, personal or education loans to see payoff progress."
          action={
            <button className="btn-primary" onClick={openNew}>
              Add your first loan
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.loans.map((l) => {
            const paid = l.principal > 0 ? ((l.principal - l.outstanding) / l.principal) * 100 : 0
            const remaining = loanMonthsRemaining(l.outstanding, l.interestRate, l.emi)
            return (
              <Card key={l.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{l.name}</p>
                    <p className="text-xs text-slate-500">
                      {l.lender || 'Lender not set'} · {l.interestRate}% p.a. · from {formatDate(l.startDate)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(l)}>
                      Edit
                    </button>
                    <ConfirmButton onConfirm={() => removeLoan(l.id)} label="✕" />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Outstanding</p>
                    <p className="font-semibold text-rose-400">{formatMoney(l.outstanding, cur)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">EMI</p>
                    <p className="font-semibold">{formatMoney(l.emi, cur)}</p>
                  </div>
                </div>

                <div className="mt-3 h-1.5 rounded-full bg-slate-800">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500"
                    style={{ width: `${Math.max(0, Math.min(paid, 100))}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {paid.toFixed(1)}% repaid ·{' '}
                  {Number.isFinite(remaining)
                    ? `${remaining} EMIs left (~${(remaining / 12).toFixed(1)} yrs)`
                    : 'EMI does not cover the interest'}
                </p>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={open}
        title={form.id ? 'Edit loan' : 'New loan'}
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
          <Field label="Loan name">
            <input
              className="field"
              value={form.name}
              maxLength={60}
              placeholder="Home loan"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Lender">
            <input
              className="field"
              value={form.lender}
              maxLength={60}
              onChange={(e) => setForm({ ...form, lender: e.target.value })}
            />
          </Field>
          <Field label={`Principal (${cur})`}>
            <input
              type="number"
              inputMode="decimal"
              className="field"
              value={form.principal}
              onChange={(e) => setForm({ ...form, principal: e.target.value })}
            />
          </Field>
          <Field label={`Outstanding (${cur})`}>
            <input
              type="number"
              inputMode="decimal"
              className="field"
              value={form.outstanding}
              onChange={(e) => setForm({ ...form, outstanding: e.target.value })}
            />
          </Field>
          <Field label="Interest rate (% p.a.)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="field"
              value={form.interestRate}
              onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
            />
          </Field>
          <Field label="Tenure (months)">
            <input
              type="number"
              inputMode="numeric"
              className="field"
              value={form.tenureMonths}
              onChange={(e) => setForm({ ...form, tenureMonths: e.target.value })}
            />
          </Field>
          <Field label={`EMI (${cur})`}>
            <input
              type="number"
              inputMode="decimal"
              className="field"
              value={form.emi}
              onChange={(e) => setForm({ ...form, emi: e.target.value })}
            />
          </Field>
          <Field label="Start date">
            <input
              type="date"
              className="field"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </Field>
          <button className="btn-ghost sm:col-span-2" onClick={suggestEmi}>
            Calculate EMI from principal, rate & tenure
          </button>
        </div>
      </Modal>
    </div>
  )
}
