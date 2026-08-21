import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { useStore } from '../store/useStore'
import { Card, ConfirmButton, EmptyState, Field, Modal, Stat } from '../components/ui'
import type { Investment, InvestmentType } from '../types'
import { formatDate, formatMoney, formatPercent, today } from '../lib/format'
import { downloadCsv } from '../lib/csv'

const TYPE_LABEL: Record<InvestmentType, string> = {
  stock: 'Stocks',
  mutual_fund: 'Mutual funds',
  nps: 'NPS',
  epf: 'EPF / EPFO',
  fd: 'Fixed deposit',
  gold: 'Gold',
  other: 'Other',
}

const COLORS = ['#328eff', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#eab308', '#94a3b8']

interface FormState {
  id?: string
  name: string
  type: InvestmentType
  symbol: string
  category: string
  units: string
  invested: string
  currentValue: string
  asOf: string
  note: string
}

function blankForm(): FormState {
  return {
    name: '',
    type: 'stock',
    symbol: '',
    category: '',
    units: '',
    invested: '',
    currentValue: '',
    asOf: today(),
    note: '',
  }
}

export function Investments() {
  const data = useStore((s) => s.data)
  const addInvestment = useStore((s) => s.addInvestment)
  const updateInvestment = useStore((s) => s.updateInvestment)
  const removeInvestment = useStore((s) => s.removeInvestment)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm())
  const [typeFilter, setTypeFilter] = useState<'all' | InvestmentType>('all')

  const cur = data.currency

  const list = useMemo(
    () =>
      data.investments
        .filter((i) => (typeFilter === 'all' ? true : i.type === typeFilter))
        .sort((a, b) => b.currentValue - a.currentValue),
    [data.investments, typeFilter],
  )

  const invested = data.investments.reduce((s, i) => s + i.invested, 0)
  const value = data.investments.reduce((s, i) => s + i.currentValue, 0)
  const gain = value - invested
  const ret = invested > 0 ? (gain / invested) * 100 : 0

  const allocation = useMemo(() => {
    const map = new Map<InvestmentType, number>()
    for (const i of data.investments) map.set(i.type, (map.get(i.type) ?? 0) + i.currentValue)
    return [...map.entries()].map(([type, amount]) => ({ name: TYPE_LABEL[type], amount }))
  }, [data.investments])

  const openNew = () => {
    setForm(blankForm())
    setOpen(true)
  }

  const openEdit = (i: Investment) => {
    setForm({
      id: i.id,
      name: i.name,
      type: i.type,
      symbol: i.symbol ?? '',
      category: i.category ?? '',
      units: i.units != null ? String(i.units) : '',
      invested: String(i.invested),
      currentValue: String(i.currentValue),
      asOf: i.asOf,
      note: i.note ?? '',
    })
    setOpen(true)
  }

  const save = () => {
    const name = form.name.trim()
    if (!name) return
    const payload: Omit<Investment, 'id'> = {
      name,
      type: form.type,
      symbol: form.symbol.trim() || undefined,
      category: form.category.trim() || undefined,
      units: form.units ? Number(form.units) : undefined,
      invested: Number(form.invested) || 0,
      currentValue: Number(form.currentValue) || 0,
      asOf: form.asOf || today(),
      note: form.note.trim() || undefined,
    }
    if (form.id) updateInvestment(form.id, payload)
    else addInvestment(payload)
    setOpen(false)
  }

  const exportCsv = () =>
    downloadCsv(
      `investments-${today()}.csv`,
      ['Name', 'Symbol', 'Type', 'Category', 'Units', 'Invested', 'Current value', 'Gain', 'Return %', 'As of', 'Note'],
      list.map((i) => [
        i.name,
        i.symbol ?? '',
        TYPE_LABEL[i.type],
        i.category ?? '',
        i.units ?? '',
        i.invested,
        i.currentValue,
        i.currentValue - i.invested,
        i.invested > 0 ? (((i.currentValue - i.invested) / i.invested) * 100).toFixed(2) : '0',
        i.asOf,
        i.note ?? '',
      ]),
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Investments</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportCsv} disabled={!list.length}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={openNew}>
            + Add holding
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current value" value={formatMoney(value, cur)} />
        <Stat label="Invested" value={formatMoney(invested, cur)} />
        <Stat label="Gain / loss" value={formatMoney(gain, cur)} tone={gain >= 0 ? 'good' : 'bad'} />
        <Stat label="Overall return" value={formatPercent(ret)} tone={ret >= 0 ? 'good' : 'bad'} />
      </div>

      {data.investments.length === 0 ? (
        <EmptyState
          text="Track your stocks, mutual funds, NPS, EPF and more. Update the current value whenever you check your statements."
          action={
            <button className="btn-primary" onClick={openNew}>
              Add your first holding
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card title="Asset allocation">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocation} dataKey="amount" nameKey="name" innerRadius={45} outerRadius={80}>
                    {allocation.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12 }}
                    formatter={(v: number) => formatMoney(v, cur)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            title="Holdings"
            className="lg:col-span-2"
            action={
              <select
                className="field w-auto py-1 text-xs"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | InvestmentType)}
              >
                <option value="all">All types</option>
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            }
          >
            <div className="space-y-2">
              {list.map((i) => {
                const g = i.currentValue - i.invested
                const r = i.invested > 0 ? (g / i.invested) * 100 : 0
                return (
                  <div
                    key={i.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 p-3"
                    role="button"
                    onClick={() => openEdit(i)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {i.name}
                        {i.symbol ? <span className="ml-2 text-xs text-slate-500">{i.symbol}</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        {TYPE_LABEL[i.type]}
                        {i.category ? ` · ${i.category}` : ''}
                        {i.units ? ` · ${i.units} units` : ''} · as of {formatDate(i.asOf)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatMoney(i.currentValue, cur)}</p>
                      <p className={`text-xs ${g >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {g >= 0 ? '+' : '−'}
                        {formatMoney(Math.abs(g), cur, true)} ({formatPercent(r)})
                      </p>
                    </div>
                    <span onClick={(e) => e.stopPropagation()}>
                      <ConfirmButton onConfirm={() => removeInvestment(i.id)} label="✕" />
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={open}
        title={form.id ? 'Edit holding' : 'New holding'}
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
              maxLength={80}
              placeholder="HDFC Flexi Cap / Infosys / NPS Tier 1"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Type">
            <select
              className="field"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as InvestmentType })}
            >
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Units (optional)">
            <input
              type="number"
              inputMode="decimal"
              step="0.0001"
              className="field"
              value={form.units}
              onChange={(e) => setForm({ ...form, units: e.target.value })}
            />
          </Field>
          <Field label="Symbol / account">
            <input
              className="field"
              value={form.symbol}
              maxLength={30}
              placeholder="INFY / Tier I"
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            />
          </Field>
          <Field label="Sector / fund category">
            <input
              className="field"
              value={form.category}
              maxLength={60}
              placeholder="Equity: Small Cap / Banking"
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </Field>
          <Field label={`Total invested (${cur})`}>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="field"
              value={form.invested}
              onChange={(e) => setForm({ ...form, invested: e.target.value })}
            />
          </Field>
          <Field label={`Current value (${cur})`}>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="field"
              value={form.currentValue}
              onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
            />
          </Field>
          <Field label="Value as of">
            <input
              type="date"
              className="field"
              value={form.asOf}
              onChange={(e) => setForm({ ...form, asOf: e.target.value })}
            />
          </Field>
          <Field label="Note">
            <input
              className="field"
              value={form.note}
              maxLength={120}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
