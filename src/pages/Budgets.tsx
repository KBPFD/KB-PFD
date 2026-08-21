import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, EmptyState, Stat } from '../components/ui'
import { txnsInMonth } from '../lib/calc'
import { addMonths, formatMoney, formatPercent, monthKey, monthLabel } from '../lib/format'

export function Budgets() {
  const data = useStore((s) => s.data)
  const setBudget = useStore((s) => s.setBudget)
  const removeBudget = useStore((s) => s.removeBudget)
  const [month, setMonth] = useState(monthKey())
  const cur = data.currency

  const rows = useMemo(() => {
    const monthTxns = txnsInMonth(data.transactions, month).filter((t) => t.type === 'expense')
    return data.categories.expense.map((category) => {
      const budget = data.budgets.find((b) => b.month === month && b.category === category)
      const actual = monthTxns.filter((t) => t.category === category).reduce((s, t) => s + t.amount, 0)
      return { category, budgetId: budget?.id, budget: budget?.amount ?? 0, actual }
    })
  }, [data, month])

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0)
  const totalActual = rows.reduce((s, r) => s + r.actual, 0)
  const used = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0

  const copyPrevious = () => {
    const prev = addMonths(month, -1)
    for (const b of data.budgets.filter((x) => x.month === prev)) {
      setBudget(month, b.category, b.amount)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Budgets</h1>
        <div className="flex gap-2">
          <input
            type="month"
            className="field w-auto"
            value={month}
            onChange={(e) => setMonth(e.target.value || monthKey())}
          />
          <button className="btn-ghost" onClick={copyPrevious}>
            Copy {monthLabel(addMonths(month, -1))}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Budgeted" value={formatMoney(totalBudget, cur)} />
        <Stat label="Spent" value={formatMoney(totalActual, cur)} tone={totalActual > totalBudget && totalBudget > 0 ? 'bad' : 'default'} />
        <Stat
          label="Remaining"
          value={formatMoney(totalBudget - totalActual, cur)}
          tone={totalBudget - totalActual >= 0 ? 'good' : 'bad'}
        />
        <Stat label="Budget used" value={formatPercent(used)} />
      </div>

      {data.categories.expense.length === 0 ? (
        <EmptyState text="Add expense categories in Settings first." />
      ) : (
        <Card title={`Category budgets · ${monthLabel(month)}`}>
          <div className="space-y-3">
            {rows.map((r) => {
              const pct = r.budget > 0 ? Math.min((r.actual / r.budget) * 100, 100) : 0
              const over = r.budget > 0 && r.actual > r.budget
              return (
                <div key={r.category} className="rounded-xl border border-slate-800 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{r.category}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="100"
                        className="field w-32 py-1 text-right"
                        value={r.budget || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          if (!e.target.value && r.budgetId) removeBudget(r.budgetId)
                          else setBudget(month, r.category, Number.isFinite(value) ? value : 0)
                        }}
                      />
                      <span
                        className={`w-28 text-right text-sm ${over ? 'text-rose-400' : 'text-slate-300'}`}
                      >
                        {formatMoney(r.actual, cur)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-800">
                    <div
                      className={`h-1.5 rounded-full ${over ? 'bg-rose-500' : 'bg-brand-500'}`}
                      style={{ width: `${r.budget > 0 ? pct : 0}%` }}
                    />
                  </div>
                  {r.budget > 0 && (
                    <p className={`mt-1 text-xs ${over ? 'text-rose-400' : 'text-slate-500'}`}>
                      {over
                        ? `Over by ${formatMoney(r.actual - r.budget, cur)}`
                        : `${formatMoney(r.budget - r.actual, cur)} left`}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
