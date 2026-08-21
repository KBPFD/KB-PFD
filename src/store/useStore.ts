import { create } from 'zustand'
import type {
  Account,
  AppData,
  GiftEntry,
  Investment,
  Loan,
  Policy,
  RecurringBill,
  Transaction,
} from '../types'
import { emptyData, normalizeData } from '../types'
import { loadFromDrive, saveToDrive, clearDriveCache } from '../lib/drive'
import {
  getAccessToken,
  requestAccessToken,
  signOut as googleSignOut,
} from '../lib/googleAuth'
import {
  deriveKey,
  fromBase64,
  isEnvelope,
  newSalt,
  newRecoveryKey,
  newVaultKey,
  seal,
  unseal,
  unwrapVaultKey,
  wrapVaultKey,
  KDF_ITERATIONS,
  type Envelope,
} from '../lib/crypto'
import { uid } from '../lib/id'

const LOCAL_CACHE_KEY = 'pfd.vault'

export type SyncState = 'idle' | 'loading' | 'saving' | 'error' | 'offline'

export interface Profile {
  username: string
  salt: string
  iterations: number
}

interface Store {
  ready: boolean
  /** Google Drive connection - storage only, not the app login */
  driveConnected: boolean
  /** the account this vault belongs to, once one exists */
  profile: Profile | null
  unlocked: boolean
  data: AppData
  sync: SyncState
  error: string | null
  lastSyncedAt: string | null
  dirty: boolean

  init: () => Promise<void>
  connectDrive: () => Promise<void>
  createAccount: (username: string, password: string) => Promise<string | null>
  unlock: (username: string, password: string) => Promise<boolean>
  unlockWithRecoveryKey: (username: string, recoveryKey: string) => Promise<boolean>
  changePassword: (currentPassword: string, nextPassword: string) => Promise<boolean>
  lock: () => void
  signOut: () => void
  pull: () => Promise<void>
  push: () => Promise<void>
  setError: (msg: string | null) => void

  update: (fn: (draft: AppData) => void) => void
  replaceAll: (data: AppData) => void

  addAccount: (a: Omit<Account, 'id'>) => void
  updateAccount: (id: string, patch: Partial<Account>) => void
  removeAccount: (id: string) => void

  addTransaction: (t: Omit<Transaction, 'id'>) => void
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  removeTransaction: (id: string) => void

  setBudget: (month: string, category: string, amount: number) => void
  removeBudget: (id: string) => void

  addInvestment: (i: Omit<Investment, 'id'>) => void
  updateInvestment: (id: string, patch: Partial<Investment>) => void
  removeInvestment: (id: string) => void

  addLoan: (l: Omit<Loan, 'id'>) => void
  updateLoan: (id: string, patch: Partial<Loan>) => void
  removeLoan: (id: string) => void

  addBill: (b: Omit<RecurringBill, 'id'>) => void
  updateBill: (id: string, patch: Partial<RecurringBill>) => void
  removeBill: (id: string) => void

  addPolicy: (p: Omit<Policy, 'id'>) => void
  updatePolicy: (id: string, patch: Partial<Policy>) => void
  removePolicy: (id: string) => void

  addGift: (g: Omit<GiftEntry, 'id'>) => void
  updateGift: (id: string, patch: Partial<GiftEntry>) => void
  removeGift: (id: string) => void

  addCategory: (kind: 'income' | 'expense', name: string) => void
  removeCategory: (kind: 'income' | 'expense', name: string) => void
}

/** AES key for the current session; never persisted. */
let vaultKey: CryptoKey | null = null
/** Encrypted copy of the Drive file, kept so the app opens offline. */
let cachedEnvelope: Envelope | null = readCachedEnvelope()
/** Plain data pulled from a pre-encryption file, adopted on first unlock. */
let legacyData: AppData | null = null
let keyWrap: Pick<Envelope, 'keyIv' | 'keyData' | 'recoverySalt' | 'recoveryIv' | 'recoveryKeyData'> | undefined

function readCachedEnvelope(): Envelope | null {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return isEnvelope(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeCachedEnvelope(envelope: Envelope | null) {
  try {
    if (envelope) localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(envelope))
    else localStorage.removeItem(LOCAL_CACHE_KEY)
  } catch {
    /* storage full or blocked - Drive remains the source of truth */
  }
}

function profileOf(envelope: Envelope): Profile {
  return { username: envelope.username, salt: envelope.salt, iterations: envelope.iterations }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

export const useStore = create<Store>((set, get) => {
  const mutate = (fn: (draft: AppData) => void) => {
    if (!get().unlocked) return
    const next: AppData = structuredClone(get().data)
    fn(next)
    next.updatedAt = new Date().toISOString()
    set({ data: next, dirty: true })
    scheduleSave()
  }

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (get().unlocked) void get().push()
    }, 1500)
  }

  /** Encrypts the current data and returns the envelope, caching it locally. */
  const sealCurrent = async (): Promise<Envelope | null> => {
    const profile = get().profile
    if (!vaultKey || !profile) return null
    const envelope = await seal(vaultKey, profile, get().data, keyWrap)
    cachedEnvelope = envelope
    writeCachedEnvelope(envelope)
    return envelope
  }

  const openEnvelope = async (envelope: Envelope, password: string): Promise<AppData | null> => {
    try {
      const wrapper = await deriveKey(password, fromBase64(envelope.salt), envelope.iterations)
      const key = envelope.keyIv && envelope.keyData ? await unwrapVaultKey(wrapper, envelope.keyIv, envelope.keyData) : wrapper
      const payload = await unseal<AppData>(key, envelope)
      vaultKey = key
      keyWrap = envelope.keyIv ? envelope : undefined
      return normalizeData(payload)
    } catch {
      return null
    }
  }

  return {
    ready: false,
    driveConnected: false,
    profile: cachedEnvelope ? profileOf(cachedEnvelope) : null,
    unlocked: false,
    data: emptyData(),
    sync: 'idle',
    error: null,
    lastSyncedAt: null,
    dirty: false,

    setError: (msg) => set({ error: msg }),

    async init() {
      try {
        if (!getAccessToken()) await requestAccessToken({ silent: true })
        set({ driveConnected: true })
        await get().pull()
      } catch {
        // No live Google session: the app still opens from the cached vault.
      } finally {
        set({ ready: true })
      }
    },

    async connectDrive() {
      set({ error: null })
      try {
        await requestAccessToken()
        set({ driveConnected: true })
        await get().pull()
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Could not connect Google Drive' })
      }
    },

    async createAccount(username, password) {
      const name = username.trim()
      if (!name) {
        set({ error: 'Choose a username.' })
        return null
      }
      if (get().profile) {
        set({ error: 'An account already exists. Sign in with its password instead.' })
        return null
      }
      const profile: Profile = { username: name, salt: newSalt(), iterations: KDF_ITERATIONS }
      const passwordKey = await deriveKey(password, fromBase64(profile.salt), profile.iterations)
      const recoveryKey = newRecoveryKey()
      const recoverySalt = newSalt()
      const recoveryWrapper = await deriveKey(recoveryKey.replace(/-/g, ''), fromBase64(recoverySalt), KDF_ITERATIONS)
      vaultKey = await newVaultKey()
      const passwordWrap = await wrapVaultKey(passwordKey, vaultKey)
      const recoveryWrap = await wrapVaultKey(recoveryWrapper, vaultKey)
      keyWrap = {
        keyIv: passwordWrap.iv,
        keyData: passwordWrap.data,
        recoverySalt,
        recoveryIv: recoveryWrap.iv,
        recoveryKeyData: recoveryWrap.data,
      }
      set({
        profile,
        unlocked: true,
        // adopt anything that was already in Drive before encryption was added
        data: legacyData ?? emptyData(),
        error: null,
        dirty: true,
      })
      await get().push()
      return recoveryKey
    },

    async unlock(username, password) {
      const profile = get().profile
      const envelope = cachedEnvelope
      if (!profile || !envelope) {
        set({ error: 'No account found on this device yet. Create one first.' })
        return false
      }
      if (username.trim().toLowerCase() !== profile.username.toLowerCase()) {
        set({ error: 'Incorrect username or password.' })
        return false
      }
      const data = await openEnvelope(envelope, password)
      if (!data) {
        set({ error: 'Incorrect username or password.' })
        return false
      }
      set({ data, unlocked: true, error: null, dirty: false })
      if (get().driveConnected) void get().pull()
      return true
    },

    async unlockWithRecoveryKey(username, recoveryKey) {
      const profile = get().profile
      const envelope = cachedEnvelope
      if (!profile || !envelope?.recoverySalt || !envelope.recoveryIv || !envelope.recoveryKeyData) {
        set({ error: 'This vault does not have a recovery key. Sign in with your password.' })
        return false
      }
      if (username.trim().toLowerCase() !== profile.username.toLowerCase()) {
        set({ error: 'Incorrect username or recovery key.' })
        return false
      }
      try {
        const wrapper = await deriveKey(recoveryKey.replace(/\s|-/g, ''), fromBase64(envelope.recoverySalt), KDF_ITERATIONS)
        const key = await unwrapVaultKey(wrapper, envelope.recoveryIv, envelope.recoveryKeyData)
        const data = await unseal<AppData>(key, envelope)
        vaultKey = key
        keyWrap = envelope
        set({ data: normalizeData(data), unlocked: true, error: null, dirty: false })
        return true
      } catch {
        set({ error: 'Incorrect username or recovery key.' })
        return false
      }
    },

    async changePassword(currentPassword, nextPassword) {
      const profile = get().profile
      if (!profile || !cachedEnvelope) return false
      const check = await openEnvelope(cachedEnvelope, currentPassword)
      if (!check) {
        set({ error: 'Current password is incorrect.' })
        return false
      }
      const nextProfile: Profile = { ...profile, salt: newSalt(), iterations: KDF_ITERATIONS }
      if (!vaultKey) return false
      const nextPasswordKey = await deriveKey(nextPassword, fromBase64(nextProfile.salt), nextProfile.iterations)
      const nextPasswordWrap = await wrapVaultKey(nextPasswordKey, vaultKey)
      keyWrap = { ...keyWrap, keyIv: nextPasswordWrap.iv, keyData: nextPasswordWrap.data }
      set({ profile: nextProfile, error: null })
      await get().push()
      return true
    },

    lock() {
      vaultKey = null
      set({ unlocked: false, data: emptyData(), dirty: false })
    },

    signOut() {
      googleSignOut()
      clearDriveCache()
      writeCachedEnvelope(null)
      vaultKey = null
      cachedEnvelope = null
      keyWrap = undefined
      legacyData = null
      set({
        driveConnected: false,
        profile: null,
        unlocked: false,
        data: emptyData(),
        lastSyncedAt: null,
        dirty: false,
      })
    },

    async pull() {
      set({ sync: 'loading', error: null })
      try {
        const { raw } = await loadFromDrive()

        if (isEnvelope(raw)) {
          cachedEnvelope = raw
          writeCachedEnvelope(raw)
          const profile = profileOf(raw)
          set({ profile })
          if (vaultKey) {
            try {
              const payload = await unseal<AppData>(vaultKey, raw)
              set({ data: normalizeData(payload), dirty: false })
            } catch {
              // The file was re-encrypted elsewhere with a different password.
              vaultKey = null
              set({ unlocked: false, error: 'Your password changed on another device. Sign in again.' })
            }
          }
        } else if (raw) {
          // Pre-encryption file: keep it aside until an account password exists.
          legacyData = normalizeData(raw)
          if (get().unlocked) {
            set({ data: legacyData, dirty: true })
            await sealCurrent()
          }
        } else if (get().unlocked) {
          await get().push()
        }

        set({ sync: 'idle', lastSyncedAt: new Date().toISOString() })
      } catch (e) {
        set({ sync: 'error', error: e instanceof Error ? e.message : 'Could not load from Drive' })
      }
    },

    async push() {
      if (!get().unlocked) return
      const envelope = await sealCurrent()
      if (!envelope) return
      if (!get().driveConnected) {
        // Saved locally; it will reach Drive once the connection is restored.
        set({ sync: 'offline' })
        return
      }
      set({ sync: 'saving', error: null })
      try {
        await saveToDrive(envelope)
        set({ sync: 'idle', lastSyncedAt: new Date().toISOString(), dirty: false })
      } catch (e) {
        set({ sync: 'error', error: e instanceof Error ? e.message : 'Could not save to Drive' })
      }
    },

    update: mutate,

    replaceAll(data) {
      mutate((draft) => {
        Object.assign(draft, normalizeData(data))
      })
    },

    addAccount: (a) => mutate((d) => void d.accounts.push({ ...a, id: uid('acc') })),
    updateAccount: (id, patch) =>
      mutate((d) => {
        const item = d.accounts.find((x) => x.id === id)
        if (item) Object.assign(item, patch)
      }),
    removeAccount: (id) =>
      mutate((d) => {
        d.accounts = d.accounts.filter((x) => x.id !== id)
        d.transactions = d.transactions.filter((t) => t.accountId !== id && t.toAccountId !== id)
      }),

    addTransaction: (t) => mutate((d) => void d.transactions.push({ ...t, id: uid('txn') })),
    updateTransaction: (id, patch) =>
      mutate((d) => {
        const item = d.transactions.find((x) => x.id === id)
        if (item) Object.assign(item, patch)
      }),
    removeTransaction: (id) =>
      mutate((d) => {
        d.transactions = d.transactions.filter((x) => x.id !== id)
      }),

    setBudget: (month, category, amount) =>
      mutate((d) => {
        const existing = d.budgets.find((b) => b.month === month && b.category === category)
        if (existing) existing.amount = amount
        else d.budgets.push({ id: uid('bgt'), month, category, amount })
      }),
    removeBudget: (id) =>
      mutate((d) => {
        d.budgets = d.budgets.filter((b) => b.id !== id)
      }),

    addInvestment: (i) => mutate((d) => void d.investments.push({ ...i, id: uid('inv') })),
    updateInvestment: (id, patch) =>
      mutate((d) => {
        const item = d.investments.find((x) => x.id === id)
        if (item) Object.assign(item, patch)
      }),
    removeInvestment: (id) =>
      mutate((d) => {
        d.investments = d.investments.filter((x) => x.id !== id)
      }),

    addLoan: (l) => mutate((d) => void d.loans.push({ ...l, id: uid('loan') })),
    updateLoan: (id, patch) =>
      mutate((d) => {
        const item = d.loans.find((x) => x.id === id)
        if (item) Object.assign(item, patch)
      }),
    removeLoan: (id) =>
      mutate((d) => {
        d.loans = d.loans.filter((x) => x.id !== id)
      }),

    addBill: (b) => mutate((d) => void d.bills.push({ ...b, id: uid('bill') })),
    updateBill: (id, patch) =>
      mutate((d) => {
        const item = d.bills.find((x) => x.id === id)
        if (item) Object.assign(item, patch)
      }),
    removeBill: (id) =>
      mutate((d) => {
        d.bills = d.bills.filter((x) => x.id !== id)
      }),

    addPolicy: (p) => mutate((d) => void d.policies.push({ ...p, id: uid('pol') })),
    updatePolicy: (id, patch) =>
      mutate((d) => {
        const item = d.policies.find((x) => x.id === id)
        if (item) Object.assign(item, patch)
      }),
    removePolicy: (id) =>
      mutate((d) => {
        d.policies = d.policies.filter((x) => x.id !== id)
      }),

    addGift: (g) => mutate((d) => void d.gifts.push({ ...g, id: uid('gift') })),
    updateGift: (id, patch) =>
      mutate((d) => {
        const item = d.gifts.find((x) => x.id === id)
        if (item) Object.assign(item, patch)
      }),
    removeGift: (id) =>
      mutate((d) => {
        d.gifts = d.gifts.filter((x) => x.id !== id)
      }),

    addCategory: (kind, name) =>
      mutate((d) => {
        const clean = name.trim()
        if (clean && !d.categories[kind].includes(clean)) d.categories[kind].push(clean)
      }),
    removeCategory: (kind, name) =>
      mutate((d) => {
        d.categories[kind] = d.categories[kind].filter((c) => c !== name)
      }),
  }
})
