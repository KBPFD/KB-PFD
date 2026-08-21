import type { AppData, Account, Transaction } from '../types'
import { monthKey } from './format'

export function accountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.openingBalance
  for (const t of transactions) {
    if (t.type === 'transfer') {
      if (t.accountId === account.id) balance -= t.amount
      if (t.toAccountId === account.id) balance += t.amount
    } else if (t.accountId === account.id) {
      balance += t.type === 'income' ? t.amount : -t.amount
    }
  }
  return balance
}

export function totalCash(data: AppData): number {
  return data.accounts
    .filter((a) => !a.archived)
    .reduce((sum, a) => sum + accountBalance(a, data.transactions), 0)
}

export function totalInvestments(data: AppData): number {
  return data.investments.reduce((sum, i) => sum + i.currentValue, 0)
}

export function totalInvested(data: AppData): number {
  return data.investments.reduce((sum, i) => sum + i.invested, 0)
}

export function totalLoanOutstanding(data: AppData): number {
  return data.loans.reduce((sum, l) => sum + l.outstanding, 0)
}

export function netWorth(data: AppData): number {
  return totalCash(data) + totalInvestments(data) - totalLoanOutstanding(data)
}

export function txnsInMonth(transactions: Transaction[], month: string): Transaction[] {
  return transactions.filter((t) => monthKey(t.date) === month)
}

export function monthTotals(transactions: Transaction[], month: string) {
  const list = txnsInMonth(transactions, month)
  const income = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  return { income, expense, savings: income - expense }
}

export function categoryBreakdown(
  transactions: Transaction[],
  month: string,
  type: 'income' | 'expense',
): { category: string; amount: number }[] {
  const map = new Map<string, number>()
  for (const t of txnsInMonth(transactions, month)) {
    if (t.type !== type) continue
    map.set(t.category || 'Uncategorised', (map.get(t.category || 'Uncategorised') ?? 0) + t.amount)
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export function monthlySeries(transactions: Transaction[], months: string[]) {
  return months.map((m) => {
    const { income, expense, savings } = monthTotals(transactions, m)
    return { month: m, income, expense, savings }
  })
}

/** Remaining EMI months, based on outstanding balance and reducing-balance interest. */
export function loanMonthsRemaining(outstanding: number, annualRate: number, emi: number): number {
  const r = annualRate / 12 / 100
  if (emi <= 0 || outstanding <= 0) return 0
  if (r === 0) return Math.ceil(outstanding / emi)
  if (emi <= outstanding * r) return Infinity // EMI never covers the interest
  return Math.ceil(-Math.log(1 - (outstanding * r) / emi) / Math.log(1 + r))
}

export function emiFor(principal: number, annualRate: number, tenureMonths: number): number {
  const r = annualRate / 12 / 100
  if (tenureMonths <= 0) return 0
  if (r === 0) return principal / tenureMonths
  const f = Math.pow(1 + r, tenureMonths)
  return (principal * r * f) / (f - 1)
}

export function billDueDate(dueDay: number, month: string): string {
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const day = Math.min(dueDay, daysInMonth)
  return `${month}-${String(day).padStart(2, '0')}`
}
