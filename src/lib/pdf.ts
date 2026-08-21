import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { AppData } from '../types'
import { accountBalance, netWorth, totalCash, totalInvestments, totalLoanOutstanding } from './calc'
import { formatDate, formatNumber, monthLabel, monthKey } from './format'

export interface ReportRange {
  from: string
  to: string
  title?: string
}

/** jsPDF's built-in fonts have no rupee glyph, so use the ISO code instead. */
function money(value: number, currency: string): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}${currency} ${formatNumber(Math.abs(value))}`
}

export function buildReport(data: AppData, range: ReportRange): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const cur = data.currency
  const pageWidth = doc.internal.pageSize.getWidth()
  const title = range.title || 'Personal Finance Report'

  doc.setFontSize(18)
  doc.text(title, 40, 50)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(`Period: ${formatDate(range.from)} to ${formatDate(range.to)}`, 40, 68)
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 40, 68, { align: 'right' })
  doc.setTextColor(0)

  const inRange = data.transactions
    .filter((t) => t.date >= range.from && t.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date))

  const income = inRange.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = inRange.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const savings = income - expense
  const savingsRate = income > 0 ? (savings / income) * 100 : 0

  autoTable(doc, {
    startY: 90,
    head: [['Summary', 'Amount']],
    body: [
      ['Total income', money(income, cur)],
      ['Total expense', money(expense, cur)],
      ['Net savings', money(savings, cur)],
      ['Savings rate', `${savingsRate.toFixed(1)}%`],
      ['Cash & bank balance', money(totalCash(data), cur)],
      ['Investments (current value)', money(totalInvestments(data), cur)],
      ['Loans outstanding', money(totalLoanOutstanding(data), cur)],
      ['Net worth', money(netWorth(data), cur)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [27, 110, 245] },
    styles: { fontSize: 9, cellPadding: 5 },
  })

  const catMap = new Map<string, number>()
  for (const t of inRange) {
    if (t.type !== 'expense') continue
    catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.amount)
  }
  const catRows = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, amt]) => [c, money(amt, cur), `${expense > 0 ? ((amt / expense) * 100).toFixed(1) : '0.0'}%`])

  if (catRows.length) {
    autoTable(doc, {
      head: [['Expense category', 'Amount', 'Share']],
      body: catRows,
      theme: 'striped',
      headStyles: { fillColor: [27, 110, 245] },
      styles: { fontSize: 9, cellPadding: 5 },
    })
  }

  // Monthly trend inside the range
  const months = [...new Set(inRange.map((t) => monthKey(t.date)))].sort()
  if (months.length > 1) {
    const rows = months.map((m) => {
      const list = inRange.filter((t) => monthKey(t.date) === m)
      const i = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const e = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      return [monthLabel(m), money(i, cur), money(e, cur), money(i - e, cur)]
    })
    autoTable(doc, {
      head: [['Month', 'Income', 'Expense', 'Savings']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [27, 110, 245] },
      styles: { fontSize: 9, cellPadding: 5 },
    })
  }

  // Budget vs actual for months in range
  const budgetRows: string[][] = []
  for (const m of months) {
    for (const b of data.budgets.filter((x) => x.month === m)) {
      const actual = inRange
        .filter((t) => t.type === 'expense' && t.category === b.category && monthKey(t.date) === m)
        .reduce((s, t) => s + t.amount, 0)
      budgetRows.push([
        monthLabel(m),
        b.category,
        money(b.amount, cur),
        money(actual, cur),
        money(b.amount - actual, cur),
      ])
    }
  }
  if (budgetRows.length) {
    autoTable(doc, {
      head: [['Month', 'Category', 'Budget', 'Actual', 'Remaining']],
      body: budgetRows,
      theme: 'striped',
      headStyles: { fillColor: [27, 110, 245] },
      styles: { fontSize: 9, cellPadding: 5 },
    })
  }

  if (data.accounts.length) {
    autoTable(doc, {
      head: [['Account', 'Type', 'Balance']],
      body: data.accounts.map((a) => [
        a.name,
        a.type.replace('_', ' '),
        money(accountBalance(a, data.transactions), cur),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [27, 110, 245] },
      styles: { fontSize: 9, cellPadding: 5 },
    })
  }

  if (data.investments.length) {
    autoTable(doc, {
      head: [['Investment', 'Type', 'Invested', 'Current', 'Gain', 'Return']],
      body: data.investments.map((i) => {
        const gain = i.currentValue - i.invested
        const ret = i.invested > 0 ? (gain / i.invested) * 100 : 0
        return [
          i.name,
          i.type.replace('_', ' '),
          money(i.invested, cur),
          money(i.currentValue, cur),
          money(gain, cur),
          `${ret.toFixed(1)}%`,
        ]
      }),
      theme: 'striped',
      headStyles: { fillColor: [27, 110, 245] },
      styles: { fontSize: 9, cellPadding: 5 },
    })
  }

  if (data.loans.length) {
    autoTable(doc, {
      head: [['Loan', 'Lender', 'Outstanding', 'EMI', 'Rate']],
      body: data.loans.map((l) => [
        l.name,
        l.lender || '-',
        money(l.outstanding, cur),
        money(l.emi, cur),
        `${l.interestRate}%`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [27, 110, 245] },
      styles: { fontSize: 9, cellPadding: 5 },
    })
  }

  if (data.policies.length) {
    autoTable(doc, {
      head: [['Policy', 'Category', 'Provider', 'Premium', 'Frequency', 'Cover', 'Status']],
      body: data.policies.map((p) => [
        p.name,
        p.category,
        p.provider || '-',
        money(p.premium, cur),
        p.frequency,
        money(p.sumAssured, cur),
        p.status,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [27, 110, 245] },
      styles: { fontSize: 9, cellPadding: 5 },
    })
  }

  const giftsInRange = data.gifts.filter((g) => g.date >= range.from && g.date <= range.to)
  if (giftsInRange.length) {
    autoTable(doc, {
      head: [['Date', 'Type', 'Party', 'Occasion', 'Amount', 'Receipt']],
      body: giftsInRange
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((g) => [
          formatDate(g.date),
          g.kind === 'donation' ? (g.taxDeductible ? 'Donation (80G)' : 'Donation') : `Gift ${g.kind}`,
          g.party,
          g.occasion || g.item || '-',
          money(g.amount, cur),
          g.receiptNo || '-',
        ]),
      theme: 'striped',
      headStyles: { fillColor: [27, 110, 245] },
      styles: { fontSize: 9, cellPadding: 5 },
    })
  }

  if (inRange.length) {
    const accName = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? '-'
    autoTable(doc, {
      head: [['Date', 'Type', 'Category', 'Account', 'Note', 'Amount']],
      body: inRange.map((t) => [
        formatDate(t.date),
        t.type,
        t.category,
        t.type === 'transfer' ? `${accName(t.accountId)} > ${accName(t.toAccountId)}` : accName(t.accountId),
        t.note || '',
        money(t.amount, cur),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [27, 110, 245] },
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: { 5: { halign: 'right' } },
    })
  }

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(140)
    doc.text(`Page ${p} of ${pages}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, {
      align: 'right',
    })
  }

  return doc
}

export function downloadReport(data: AppData, range: ReportRange, filename: string) {
  buildReport(data, range).save(filename)
}
