import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, Field, Stat } from '../components/ui'
import { downloadCsv } from '../lib/csv'
import { addMonths, formatMoney, formatPercent, monthKey, monthLabel, today } from '../lib/format'
import { accountBalance, netWorth } from '../lib/calc'

type Preset = 'this-month' | 'last-month' | 'last-3' | 'this-year' | 'custom'

function rangeFor(preset: Preset): { from: string; to: string } {
  const now = new Date()
  const cm = monthKey()
  const endOfMonth = (key: string) => {
    const [y, m] = key.split('-').map(Number)
    return `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  }
  switch (preset) {
    case 'last-month': {
      const lm = addMonths(cm, -1)
      return { from: `${lm}-01`, to: endOfMonth(lm) }
    }
    case 'last-3':
      return { from: `${addMonths(cm, -2)}-01`, to: endOfMonth(cm) }
    case 'this-year':
      return { from: `${now.getFullYear()}-01-01`, to: today() }
    default:
      return { from: `${cm}-01`, to: endOfMonth(cm) }
  }
}

export function Reports() {
  const data = useStore((s) => s.data)
  const [preset, setPreset] = useState<Preset>('this-month')
  const [custom, setCustom] = useState(rangeFor('this-month'))
  const [busy, setBusy] = useState(false)

  const cur = data.currency
  const range = preset === 'custom' ? custom : rangeFor(preset)

  const stats = useMemo(() => {
    const list = data.transactions.filter((t) => t.date >= range.from && t.date <= range.to)
    const income = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { count: list.length, income, expense, savings: income - expense, list }
  }, [data.transactions, range.from, range.to])

  const makePdf = async (action: 'save' | 'print') => {
    setBusy(true)
    try {
      // jsPDF is heavy, so it is only downloaded when a report is actually generated.
      const { buildReport } = await import('../lib/pdf')
      const doc = buildReport(data, { ...range, title: 'Personal Finance Report' })
      if (action === 'save') doc.save(`finance-report-${range.from}-to-${range.to}.pdf`)
      else window.open(doc.output('bloburl'), '_blank', 'noopener,noreferrer')
    } finally {
      setBusy(false)
    }
  }

  const accName = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? ''

  const exportTransactionsCsv = () =>
    downloadCsv(
      `transactions-${range.from}-to-${range.to}.csv`,
      ['Date', 'Type', 'Category', 'Account', 'To account', 'Note', 'Amount'],
      stats.list
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((t) => [
          t.date,
          t.type,
          t.category,
          accName(t.accountId),
          t.toAccountId ? accName(t.toAccountId) : '',
          t.note ?? '',
          t.amount,
        ]),
    )

  const exportNetWorthCsv = () => {
    const rows: (string | number)[][] = [
      ...data.accounts.map((a) => ['Account', a.name, accountBalance(a, data.transactions)]),
      ...data.investments.map((i) => ['Investment', i.name, i.currentValue]),
      ...data.loans.map((l) => ['Loan', l.name, -l.outstanding]),
      ['Total', 'Net worth', netWorth(data)],
    ]
    downloadCsv(`net-worth-${today()}.csv`, ['Kind', 'Name', 'Value'], rows)
  }

  const exportMonthlySummaryCsv = () => {
    const months = [...new Set(stats.list.map((t) => t.date.slice(0, 7)))].sort()
    downloadCsv(
      `monthly-summary-${range.from}-to-${range.to}.csv`,
      ['Month', 'Income', 'Expense', 'Savings', 'Savings rate %'],
      months.map((m) => {
        const list = stats.list.filter((t) => t.date.startsWith(m))
        const i = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
        const e = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
        return [monthLabel(m), i, e, i - e, i > 0 ? (((i - e) / i) * 100).toFixed(1) : '0']
      }),
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Reports</h1>

      <Card title="Report period">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Preset">
            <select className="field" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              <option value="this-month">This month</option>
              <option value="last-month">Last month</option>
              <option value="last-3">Last 3 months</option>
              <option value="this-year">This year</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              className="field"
              value={range.from}
              disabled={preset !== 'custom'}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className="field"
              value={range.to}
              disabled={preset !== 'custom'}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Transactions" value={String(stats.count)} />
        <Stat label="Income" value={formatMoney(stats.income, cur)} tone="good" />
        <Stat label="Expense" value={formatMoney(stats.expense, cur)} tone="bad" />
        <Stat
          label="Savings"
          value={formatMoney(stats.savings, cur)}
          hint={formatPercent(stats.income > 0 ? (stats.savings / stats.income) * 100 : 0) + ' of income'}
          tone={stats.savings >= 0 ? 'good' : 'bad'}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="PDF report">
          <p className="text-xs text-slate-400">
            A full statement: summary, category split, monthly trend, budget vs actual, account balances,
            investments, loans and the transaction ledger.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => void makePdf('save')} disabled={busy}>
              Download PDF
            </button>
            <button className="btn-ghost" onClick={() => void makePdf('print')} disabled={busy}>
              Open / print
            </button>
          </div>
        </Card>

        <Card title="Spreadsheet exports">
          <p className="text-xs text-slate-400">CSV files that open directly in Excel or Google Sheets.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={exportTransactionsCsv} disabled={!stats.count}>
              Transactions
            </button>
            <button className="btn-ghost" onClick={exportMonthlySummaryCsv} disabled={!stats.count}>
              Monthly summary
            </button>
            <button className="btn-ghost" onClick={exportNetWorthCsv}>
              Net worth
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
