export type AccountType = 'bank' | 'cash' | 'credit_card' | 'wallet' | 'other'

export interface Account {
  id: string
  name: string
  type: AccountType
  openingBalance: number
  archived?: boolean
}

export type TxnType = 'income' | 'expense' | 'transfer'

export interface Transaction {
  id: string
  /** yyyy-mm-dd */
  date: string
  type: TxnType
  amount: number
  accountId: string
  /** destination account, only for transfers */
  toAccountId?: string
  category: string
  note?: string
}

export interface Budget {
  id: string
  /** yyyy-mm */
  month: string
  category: string
  amount: number
}

export type InvestmentType = 'stock' | 'mutual_fund' | 'nps' | 'epf' | 'fd' | 'gold' | 'other'

export interface Investment {
  id: string
  name: string
  type: InvestmentType
  /** ticker for stocks, account for NPS */
  symbol?: string
  /** sector, fund theme or NPS asset class */
  category?: string
  /** units/shares held, optional for NPS/EPF */
  units?: number
  invested: number
  currentValue: number
  /** yyyy-mm-dd of the current value */
  asOf: string
  note?: string
}

export interface Loan {
  id: string
  name: string
  lender?: string
  principal: number
  outstanding: number
  /** annual rate in % */
  interestRate: number
  emi: number
  /** yyyy-mm-dd */
  startDate: string
  tenureMonths: number
  note?: string
}

export type PolicyCategory =
  | 'LIC'
  | 'Health Insurance'
  | 'Life Insurance'
  | 'Term Insurance'
  | 'Vehicle Insurance'
  | 'Accident Insurance'
  | 'Travel Insurance'
  | 'Other'

export type PremiumFrequency = 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly' | 'One-time'

export type PolicyStatus = 'Active' | 'Due Soon' | 'Lapsed' | 'Closed'

export interface Policy {
  id: string
  category: PolicyCategory
  provider: string
  name: string
  policyNumber?: string
  holder?: string
  nominee?: string
  /** yyyy-mm-dd */
  startDate?: string
  /** yyyy-mm-dd, or free text such as "Matured" */
  endDate?: string
  premium: number
  frequency: PremiumFrequency
  sumAssured: number
  status: PolicyStatus
  note?: string
}

export type GiftKind = 'given' | 'received' | 'donation'

export interface GiftEntry {
  id: string
  /** yyyy-mm-dd */
  date: string
  kind: GiftKind
  /** person, family or organisation */
  party: string
  occasion?: string
  amount: number
  /** description when the gift was not cash */
  item?: string
  /** eligible for an 80G style deduction */
  taxDeductible?: boolean
  receiptNo?: string
  note?: string
}

export type BillFrequency = 'monthly' | 'quarterly' | 'yearly'

export interface RecurringBill {
  id: string
  name: string
  amount: number
  category: string
  /** day of month, 1-31 */
  dueDay: number
  frequency: BillFrequency
  accountId?: string
  active: boolean
  /** yyyy-mm of the last month marked paid */
  lastPaidMonth?: string
}

export interface Categories {
  income: string[]
  expense: string[]
}

export interface AppData {
  version: number
  updatedAt: string
  currency: string
  categories: Categories
  accounts: Account[]
  transactions: Transaction[]
  budgets: Budget[]
  investments: Investment[]
  loans: Loan[]
  bills: RecurringBill[]
  policies: Policy[]
  gifts: GiftEntry[]
}

export const DATA_VERSION = 1

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    updatedAt: new Date().toISOString(),
    currency: 'INR',
    categories: {
      income: ['Salary', 'Bonus', 'Interest', 'Dividend', 'Rent', 'Gift Received', 'Other Income'],
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
        'Investment',
        'Gifts & Donations',
        'Other',
      ],
    },
    accounts: [],
    transactions: [],
    budgets: [],
    investments: [],
    loans: [],
    bills: [],
    policies: [],
    gifts: [],
  }
}

/** Fills in anything missing so older/partial files keep working. */
export function normalizeData(input: unknown): AppData {
  const base = emptyData()
  if (!input || typeof input !== 'object') return base
  const d = input as Partial<AppData>
  return {
    ...base,
    ...d,
    version: DATA_VERSION,
    currency: d.currency || base.currency,
    categories: {
      income: d.categories?.income?.length ? d.categories.income : base.categories.income,
      expense: d.categories?.expense?.length ? d.categories.expense : base.categories.expense,
    },
    accounts: d.accounts ?? [],
    transactions: d.transactions ?? [],
    budgets: d.budgets ?? [],
    investments: d.investments ?? [],
    loans: d.loans ?? [],
    bills: d.bills ?? [],
    policies: d.policies ?? [],
    gifts: d.gifts ?? [],
  }
}
