/**
 * Converts the "Karthik Bammidi Personal Finance Dashboard" workbook into the
 * JSON file this app stores in Google Drive.
 *
 *   node scripts/import-xlsx.mjs <workbook.xlsx> [-o finance-data.json]
 *
 * Load the result with Settings -> Backup & restore -> Restore from file,
 * or drop it into your Drive folder as PFD_KB/finance-data.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { readWorkbook, serialToISO, num } from './xlsx.mjs'

const args = process.argv.slice(2)
const input = args.find((a) => !a.startsWith('-'))
const outFlag = args.indexOf('-o')
const output = outFlag >= 0 ? args[outFlag + 1] : 'finance-data.json'

if (!input) {
  console.error('Usage: node scripts/import-xlsx.mjs <workbook.xlsx> [-o finance-data.json]')
  process.exit(1)
}

const book = readWorkbook(path.resolve(input))
const sheet = (name) => book[name] ?? []
const uid = (p) => `${p}_${randomUUID()}`
const cell = (rows, r, col) => rows.find((row) => row.r === r)?.cells[col]
const findRow = (rows, col, value) => rows.find((row) => (row.cells[col] ?? '').trim?.() === value)
const isSerial = (v) => Number.isFinite(Number(v)) && Number(v) > 40000 && Number(v) < 60000
const monthOf = (iso) => iso.slice(0, 7)
const todayMonth = new Date().toISOString().slice(0, 7)

/* ------------------------------------------------------------------ months */

const networth = sheet('Networth Tracker')
const monthHeader = networth.find((row) => Object.values(row.cells).some(isSerial))
const monthCols = Object.entries(monthHeader?.cells ?? {})
  .filter(([, v]) => isSerial(v))
  .map(([col, v]) => ({ col, iso: serialToISO(v) }))
  .sort((a, b) => a.iso.localeCompare(b.iso))

const debtRow = findRow(networth, 'A', 'Total Debt')
const current =
  [...monthCols]
    .reverse()
    .find((m) => monthOf(m.iso) <= todayMonth && num(debtRow?.cells[m.col]) > 0) ??
  monthCols[monthCols.length - 1]
const nextMonth = monthCols[monthCols.indexOf(current) + 1]
const asOf = current.iso

/* ---------------------------------------------------------------- accounts */

const accounts = []
const ledger = sheet('Account Balance Ledger')
const OPEN_COLS = ['B', 'D', 'F', 'H']
const CLOSE_COLS = ['C', 'E', 'G', 'I']
const balances = new Map() // account -> [{ iso, opening, closing }]

for (let i = 0; i < ledger.length; i++) {
  const header = ledger[i]
  if (!OPEN_COLS.some((c) => isSerial(header.cells[c]))) continue
  const months = OPEN_COLS.map((c) => (isSerial(header.cells[c]) ? serialToISO(header.cells[c]) : null))
  for (let j = i + 2; j < ledger.length; j++) {
    const row = ledger[j]
    const name = row.cells.A
    if (!name || name === 'Total') break
    const entries = balances.get(name) ?? []
    months.forEach((iso, k) => {
      if (!iso) return
      const opening = row.cells[OPEN_COLS[k]]
      const closing = row.cells[CLOSE_COLS[k]]
      if (opening !== undefined || closing !== undefined) {
        entries.push({ iso, opening, closing })
      }
    })
    balances.set(name, entries)
  }
}

for (const [name, entries] of balances) {
  const sorted = entries.sort((a, b) => a.iso.localeCompare(b.iso))
  const first = sorted.find((e) => e.opening !== undefined)
  accounts.push({
    id: uid('acc'),
    name,
    type: /food\s*card/i.test(name) ? 'wallet' : 'bank',
    openingBalance: first ? num(first.opening) : 0,
  })
}

const accountByName = (name) => accounts.find((a) => a.name === name)
const primary = accountByName('HDFC') ?? accounts[0]
const foodCard = accounts.find((a) => /food\s*card/i.test(a.name)) ?? primary

/* ------------------------------------------------------------ transactions */

const transactions = []
const ie = sheet('Income & Expenses')
const ieHeader = ie.find((row) => row.cells.A === 'Month' && row.cells.B === 'Salary')

if (ieHeader && primary) {
  for (const row of ie.filter((r) => r.r > ieHeader.r && isSerial(r.cells.A))) {
    const iso = serialToISO(row.cells.A)
    if (monthOf(iso) > todayMonth) continue
    if (num(row.cells.E) <= 0) continue // no actuals recorded for that month yet

    const push = (amount, type, category, accountId, note) => {
      if (num(amount) <= 0) return
      transactions.push({
        id: uid('txn'),
        date: iso,
        type,
        amount: Number(num(amount).toFixed(2)),
        accountId,
        category,
        note,
      })
    }

    push(row.cells.B, 'income', 'Salary', primary.id, 'Monthly salary (workbook)')
    push(row.cells.C, 'income', 'Food Card', foodCard.id, 'Food card credit (workbook)')
    push(row.cells.D, 'income', 'Other Income', primary.id, 'Other income (workbook)')
    push(row.cells.G, 'expense', 'EMI', primary.id, 'Loan payments total (workbook)')
    push(row.cells.H, 'expense', 'Other', primary.id, 'Other expenses total (workbook)')
    push(row.cells.M, 'expense', 'Investment', primary.id, 'Invested in stocks')
    push(row.cells.N, 'expense', 'Investment', primary.id, 'Invested in mutual funds')
    push(row.cells.O, 'expense', 'Investment', primary.id, 'Invested in NPS')
  }
}

/* ------------------------------------------------------------- investments */

const investments = []

const stocks = sheet('Stocks Portfolio')
const stockHeader = stocks.find((r) => r.cells.A === 'Symbol' && r.cells.B === 'Company')
if (stockHeader) {
  for (const row of stocks.filter((r) => r.r > stockHeader.r)) {
    const symbol = row.cells.A
    if (!symbol || symbol === 'Portfolio Total') break
    const sector = [row.cells.D, row.cells.E].filter(Boolean).join(' - ')
    investments.push({
      id: uid('inv'),
      name: row.cells.B || symbol,
      type: 'stock',
      symbol,
      category: sector || undefined,
      units: num(row.cells.F) || undefined,
      invested: num(row.cells.I),
      currentValue: num(row.cells.J),
      asOf,
      note: row.cells.C || undefined,
    })
  }
}

const mf = sheet('Mutual Fund Portfolio')
const mfHeader = mf.find((r) => r.cells.A === 'Type' && /Company|Fund/.test(r.cells.B ?? ''))
if (mfHeader) {
  for (const row of mf.filter((r) => r.r > mfHeader.r)) {
    const kind = row.cells.A
    if (!kind || kind === 'TOTAL') break
    if (num(row.cells.G) <= 0 && num(row.cells.H) <= 0) continue
    investments.push({
      id: uid('inv'),
      name: row.cells.B,
      type: 'mutual_fund',
      category: row.cells.C || undefined,
      units: num(row.cells.D) || undefined,
      invested: num(row.cells.G),
      currentValue: num(row.cells.H),
      asOf,
    })
  }
}

const nps = sheet('NPS Portfolio')
const npsHeader = nps.find((r) => r.cells.A === 'Account' && /Pension/.test(r.cells.B ?? ''))
if (npsHeader) {
  for (const row of nps.filter((r) => r.r > npsHeader.r)) {
    const account = row.cells.A
    if (!account || !row.cells.C) break
    investments.push({
      id: uid('inv'),
      name: `NPS ${row.cells.C}`,
      type: 'nps',
      symbol: account,
      category: row.cells.C,
      units: num(row.cells.D) || undefined,
      invested: num(row.cells.G),
      currentValue: num(row.cells.H),
      asOf,
      note: row.cells.B || undefined,
    })
  }
}

for (const [label, type, name] of [
  ['PF', 'epf', 'EPF / EPFO'],
  ['Gold', 'gold', 'Gold'],
]) {
  const row = findRow(networth, 'A', label)
  const value = num(row?.cells[current.col])
  if (value > 0) {
    investments.push({
      id: uid('inv'),
      name,
      type,
      invested: value,
      currentValue: value,
      asOf,
      note: 'Statement balance; no separate cost basis in the workbook',
    })
  }
}

/* -------------------------------------------------------------------- loans */

/** Solves the monthly rate that turns `principal` into `emi` over `months`. */
function impliedRate(principal, emi, months) {
  if (!principal || !emi || !months) return 0
  let lo = 0
  let hi = 0.05
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const f = Math.pow(1 + mid, months)
    const payment = mid === 0 ? principal / months : (principal * mid * f) / (f - 1)
    if (payment > emi) hi = mid
    else lo = mid
  }
  return ((lo + hi) / 2) * 12 * 100
}

const monthsBetween = (a, b) => {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

const balanceSection = networth.findIndex((r) => r.cells.A === 'Loans Balance Ledger')
const paymentsSection = networth.findIndex((r) => r.cells.A === 'Monthly Payments')
const totalDebtIndex = networth.findIndex((r) => r.cells.A === 'Total Debt')

const paymentRows = networth
  .slice(paymentsSection + 1, balanceSection)
  .filter((r) => r.cells.B && r.cells.B !== 'Total')
const balanceRows = networth.slice(balanceSection + 1, totalDebtIndex).filter((r) => r.cells.B)

const paymentFor = (name) => {
  const row = paymentRows.find((r) => r.cells.A === name)
  if (!row) return 0
  return num(row.cells[nextMonth?.col]) || num(row.cells[current.col])
}

const homeLedger = sheet('Home Loan Ledger')
const personalLedger = sheet('Personal Loan Ledger')
const goldLedger = sheet('Gold Loan Ledger')

const loanConfig = {
  'Home Loan': () => {
    const start = serialToISO(cell(homeLedger, 5, 'D')) ?? asOf
    const payoff = serialToISO(cell(homeLedger, 5, 'F'))
    return {
      lender: 'Home loan',
      principal: num(cell(homeLedger, 5, 'A')),
      interestRate: num(cell(homeLedger, 5, 'B')) * 100,
      startDate: start,
      tenureMonths: payoff ? monthsBetween(start, payoff) : 0,
      note: 'Reducing balance; payment = base amount plus last three digits of previous interest',
    }
  },
  'Personal Loan': () => {
    const principal = num(cell(personalLedger, 5, 'A'))
    const tenure = num(cell(personalLedger, 5, 'D'))
    const emi = num(cell(personalLedger, 10, 'C')) || paymentFor('Personal Loan')
    return {
      lender: 'HDFC Bank',
      principal,
      interestRate: Number(impliedRate(principal, emi, tenure).toFixed(2)),
      startDate: serialToISO(cell(personalLedger, 5, 'E')) ?? asOf,
      tenureMonths: tenure,
      note: `Total repayment ${num(cell(personalLedger, 5, 'B'))}, interest ${num(cell(personalLedger, 5, 'C'))}`,
    }
  },
  'Gold Loan 2': () => {
    const start = serialToISO(cell(goldLedger, 5, 'A')) ?? asOf
    const maturity = serialToISO(cell(goldLedger, 5, 'B'))
    return {
      lender: 'Gold loan',
      principal: num(cell(goldLedger, 5, 'C')),
      interestRate: num(cell(goldLedger, 5, 'D')) * 100,
      startDate: start,
      tenureMonths: maturity ? monthsBetween(start, maturity) : 12,
      note: `Bullet repayment, matures ${maturity ?? 'n/a'}; interest accrues separately`,
    }
  },
}

const loans = []
for (const row of balanceRows) {
  const name = row.cells.A
  const outstanding = num(row.cells[current.col])
  if (outstanding <= 0) continue
  const extra = loanConfig[name]?.() ?? {
    principal: outstanding,
    interestRate: 0,
    startDate: asOf,
    tenureMonths: 0,
  }
  loans.push({
    id: uid('loan'),
    name,
    outstanding,
    emi: Number(paymentFor(name).toFixed(2)),
    ...extra,
  })
}

/* -------------------------------------------------------------------- bills */

const bills = []
const loanNames = new Set(balanceRows.map((r) => r.cells.A))
for (const row of paymentRows) {
  const name = row.cells.A
  if (loanNames.has(name) || /credit card/i.test(name)) continue
  const amount = num(row.cells[nextMonth?.col]) || num(row.cells[current.col])
  if (amount <= 0) continue
  bills.push({
    id: uid('bill'),
    name,
    amount,
    category: /chit/i.test(name) ? 'Chit' : 'Other',
    dueDay: 5,
    frequency: 'monthly',
    active: true,
  })
}

/* ----------------------------------------------------------------- policies */

const FREQUENCIES = new Set(['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-time'])
const STATUSES = new Set(['Active', 'Due Soon', 'Lapsed', 'Closed'])

const policySheet = sheet('Policy Details')
const policyHeader = policySheet.find((r) => r.cells.A === 'Category' && r.cells.B === 'Provider')
const policies = []
if (policyHeader) {
  for (const row of policySheet.filter((r) => r.r > policyHeader.r)) {
    const category = row.cells.A
    if (!category || category === 'Policy Summary by Category') break
    if (!row.cells.C && !row.cells.D) continue
    const dateOrText = (v) => (v === undefined ? undefined : (serialToISO(v) ?? String(v)))
    policies.push({
      id: uid('pol'),
      category,
      provider: (row.cells.B ?? '').trim(),
      name: row.cells.C ?? [row.cells.B, category].filter(Boolean).join(' '),
      policyNumber: row.cells.D,
      holder: row.cells.E,
      nominee: row.cells.F,
      startDate: serialToISO(row.cells.G) ?? undefined,
      endDate: dateOrText(row.cells.H),
      premium: num(row.cells.I),
      frequency: FREQUENCIES.has(row.cells.J) ? row.cells.J : 'Yearly',
      sumAssured: num(row.cells.K),
      status: STATUSES.has(row.cells.M) ? row.cells.M : 'Active',
      note: row.cells.N,
    })
  }
}

/* ------------------------------------------------------------------- output */

const data = {
  version: 1,
  updatedAt: new Date().toISOString(),
  currency: 'INR',
  categories: {
    income: ['Salary', 'Food Card', 'Bonus', 'Interest', 'Dividend', 'Rent', 'Gift Received', 'Other Income'],
    expense: [
      'Groceries',
      'Rent',
      'Utilities',
      'Transport',
      'Dining',
      'Shopping',
      'Health',
      'Education',
      'Entertainment',
      'Insurance',
      'EMI',
      'Chit',
      'Investment',
      'Gifts & Donations',
      'Other',
    ],
  },
  accounts,
  transactions,
  budgets: [],
  investments,
  loans,
  bills,
  policies,
  gifts: [],
}

fs.writeFileSync(path.resolve(output), JSON.stringify(data, null, 2))

const sum = (list, key) => list.reduce((s, x) => s + (x[key] ?? 0), 0)
console.log(`Wrote ${output}`)
console.log(`  snapshot month   ${asOf}`)
console.log(`  accounts         ${accounts.length} (opening total ${sum(accounts, 'openingBalance').toFixed(2)})`)
console.log(`  transactions     ${transactions.length}`)
console.log(`  investments      ${investments.length} (current ${sum(investments, 'currentValue').toFixed(2)})`)
console.log(`  loans            ${loans.length} (outstanding ${sum(loans, 'outstanding').toFixed(2)})`)
console.log(`  recurring bills  ${bills.length}`)
console.log(`  policies         ${policies.length}`)
