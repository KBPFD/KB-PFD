import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useStore } from '../store/useStore'
import { Card, EmptyState, Stat } from '../components/ui'
import {
  categoryBreakdown,
  monthTotals,
  monthlySeries,
  netWorth,
  totalCash,
  totalInvested,
  totalInvestments,
  totalLoanOutstanding,
} from '../lib/calc'
import { formatMoney, formatPercent, lastNMonths, monthKey, monthLabel, addMonths } from '../lib/format'

const PIE_COLORS = [
  '#328eff',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#14b8a6',
  '#eab308',
  '#f472b6',
  '#60a5fa',
  '#94a3b8',
]

export function Dashboard() {
  const data = useStore((s) => s.data)
  const [month, setMonth] = useState(monthKey())
  const cur = data.currency

  const totals = useMemo(() => monthTotals(data.transactions, month), [data.transactions, month])
  const prev = useMemo(
    () => monthTotals(data.transactions, addMonths(month, -1)),
    [data.transactions, month],
  )
  const series = useMemo(
    () => monthlySeries(data.transactions, lastNMonths(6, month)),
    [data.transactions, month],
  )
  const byCategory = useMemo(
    () => categoryBreakdown(data.transactions, month, 'expense'),
    [data.transactions, month],
  )

  const cash = totalCash(data)
  const invested = totalInvested(data)
  const invValue = totalInvestments(data)
  const debt = totalLoanOutstanding(data)
  const worth = netWorth(data)
  const savingsRate = totals.income > 0 ? (totals.savings / totals.income) * 100 : 0
  const expenseDelta = prev.expense > 0 ? ((totals.expense - prev.expense) / prev.expense) * 100 : 0

  const hasAnything =
    data.transactions.length || data.accounts.length || data.investments.length || data.loans.length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <input
          type="month"
          className="field w-auto"
          value={month}
          max={monthKey()}
          onChange={(e) => setMonth(e.target.value || monthKey())}
        />
      </div>

      {!hasAnything && (
        <EmptyState text="Nothing here yet. Start by adding an account, then log a few transactions." />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net worth" value={formatMoney(worth, cur)} hint="cash + investments − loans" />
        <Stat label="Cash & bank" value={formatMoney(cash, cur)} hint={`${data.accounts.length} accounts`} />
        <Stat
          label="Investments"
          value={formatMoney(invValue, cur)}
          hint={`Invested ${formatMoney(invested, cur, true)} · ${formatPercent(
            invested > 0 ? ((invValue - invested) / invested) * 100 : 0,
          )}`}
          tone={invValue >= invested ? 'good' : 'bad'}
        />
        <Stat label="Loans outstanding" value={formatMoney(debt, cur)} tone={debt > 0 ? 'bad' : 'default'} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Income · ${monthLabel(month)}`} value={formatMoney(totals.income, cur)} tone="good" />
        <Stat
          label={`Expense · ${monthLabel(month)}`}
          value={formatMoney(totals.expense, cur)}
          tone="bad"
          hint={prev.expense ? `${expenseDelta >= 0 ? '▲' : '▼'} ${formatPercent(Math.abs(expenseDelta))} vs last month` : undefined}
        />
        <Stat
          label="Savings"
          value={formatMoney(totals.savings, cur)}
          tone={totals.savings >= 0 ? 'good' : 'bad'}
        />
        <Stat label="Savings rate" value={formatPercent(savingsRate)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Income vs expense (6 months)" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tickFormatter={monthLabel} stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => formatMoney(v, cur, true)} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12 }}
                  formatter={(v: number) => formatMoney(v, cur)}
                  labelFormatter={monthLabel}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="income" stroke="#22c55e" fill="url(#inc)" name="Income" />
                <Area type="monotone" dataKey="expense" stroke="#ef4444" fill="url(#exp)" name="Expense" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={`Spending by category · ${monthLabel(month)}`}>
          {byCategory.length === 0 ? (
            <EmptyState text="No expenses logged for this month." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
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
          )}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Monthly savings">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tickFormatter={monthLabel} stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => formatMoney(v, cur, true)} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12 }}
                  formatter={(v: number) => formatMoney(v, cur)}
                  labelFormatter={monthLabel}
                />
                <Bar dataKey="savings" name="Savings" radius={[6, 6, 0, 0]}>
                  {series.map((s, i) => (
                    <Cell key={i} fill={s.savings >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top expenses this month">
          {byCategory.length === 0 ? (
            <EmptyState text="Nothing to show yet." />
          ) : (
            <ul className="space-y-2">
              {byCategory.slice(0, 6).map((c, i) => {
                const share = totals.expense > 0 ? (c.amount / totals.expense) * 100 : 0
                return (
                  <li key={c.category}>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">{c.category}</span>
                      <span className="font-medium">{formatMoney(c.amount, cur)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${share}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
