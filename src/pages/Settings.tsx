import { useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, ConfirmButton, Field } from '../components/ui'
import { CURRENCIES, formatDate, today } from '../lib/format'
import { downloadJson } from '../lib/csv'
import { FILE_NAME, FOLDER_NAME } from '../lib/drive'
import { getClientId, setClientId } from '../lib/googleAuth'
import { passwordProblem } from '../lib/crypto'
import { normalizeData } from '../types'

export function Settings() {
  const data = useStore((s) => s.data)
  const driveConnected = useStore((s) => s.driveConnected)
  const profile = useStore((s) => s.profile)
  const update = useStore((s) => s.update)
  const replaceAll = useStore((s) => s.replaceAll)
  const addCategory = useStore((s) => s.addCategory)
  const removeCategory = useStore((s) => s.removeCategory)
  const pull = useStore((s) => s.pull)
  const push = useStore((s) => s.push)
  const lock = useStore((s) => s.lock)
  const signOut = useStore((s) => s.signOut)
  const connectDrive = useStore((s) => s.connectDrive)
  const changePassword = useStore((s) => s.changePassword)
  const lastSyncedAt = useStore((s) => s.lastSyncedAt)

  const [newIncome, setNewIncome] = useState('')
  const [newExpense, setNewExpense] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordNote, setPasswordNote] = useState('')
  const [driveClientId, setDriveClientId] = useState(getClientId())
  const [clientIdNote, setClientIdNote] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const saveOAuthClientId = () => {
    const value = driveClientId.trim()
    if (value && !value.endsWith('.apps.googleusercontent.com')) {
      setClientIdNote('Client ID must end with .apps.googleusercontent.com')
      return
    }
    setClientId(value)
    setDriveClientId(value)
    setClientIdNote(value ? 'Saved. Use Connect Google Drive again.' : 'Cleared. Add a valid client ID to connect Drive.')
  }

  const submitPassword = async () => {
    setPasswordNote('')
    const weakness = passwordProblem(nextPassword)
    if (weakness) return setPasswordNote(weakness)
    if (nextPassword !== confirmPassword) return setPasswordNote('The two new passwords do not match.')
    const ok = await changePassword(currentPassword, nextPassword)
    setPasswordNote(ok ? 'Password updated and the Drive file re-encrypted.' : '')
    if (ok) {
      setCurrentPassword('')
      setNextPassword('')
      setConfirmPassword('')
    }
  }

  const importJson = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = normalizeData(JSON.parse(text))
      if (window.confirm('This replaces all current data with the file contents. Continue?')) {
        replaceAll(parsed)
      }
    } catch {
      useStore.getState().setError('That file is not a valid backup.')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Card title="Account & sync">
        <div className="space-y-3 text-sm">
          <p className="text-slate-400">
            Signed in as <span className="text-slate-200">{profile?.username}</span>
          </p>
          <p className="text-xs text-slate-500">
            Storage:{' '}
            {driveConnected ? (
              <>
                Google Drive ·{' '}
                <span className="font-mono">
                  {FOLDER_NAME}/{FILE_NAME}
                </span>{' '}
                (encrypted with your password)
              </>
            ) : (
              'not connected — changes stay on this device until you connect Drive'
            )}
            {lastSyncedAt && ` · last synced ${new Date(lastSyncedAt).toLocaleString()}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {driveConnected ? (
              <>
                <button className="btn-ghost" onClick={() => void push()}>
                  Save to Drive now
                </button>
                <button className="btn-ghost" onClick={() => void pull()}>
                  Reload from Drive
                </button>
              </>
            ) : (
              <button className="btn-ghost" onClick={() => void connectDrive()}>
                Connect Google Drive
              </button>
            )}
            <button className="btn-ghost" onClick={lock}>
              Lock now
            </button>
            <ConfirmButton
              label="Sign out & forget this device"
              onConfirm={signOut}
            />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <Field label="Google OAuth client ID">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="field font-mono text-xs"
                  placeholder="1234567890-abc123.apps.googleusercontent.com"
                  value={driveClientId}
                  onChange={(e) => setDriveClientId(e.target.value)}
                />
                <button className="btn-ghost sm:whitespace-nowrap" onClick={saveOAuthClientId}>
                  Save client ID
                </button>
              </div>
            </Field>
            <p className="mt-2 text-xs text-slate-500">
              Required for Google Drive connect. If OAuth shows "disabled_client", create a new web
              client in Google Cloud and paste it here.
            </p>
            {clientIdNote && <p className="mt-1 text-xs text-amber-300">{clientIdNote}</p>}
          </div>
          <p className="text-xs text-slate-600">
            Signing out clears the encrypted copy held on this device. Your Drive file stays where it
            is and can be unlocked again with the same username and password.
          </p>
        </div>
      </Card>

      <Card title="Change password">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Current password">
            <input
              type="password"
              className="field"
              value={currentPassword}
              autoComplete="current-password"
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              className="field"
              value={nextPassword}
              autoComplete="new-password"
              onChange={(e) => setNextPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              className="field"
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            className="btn-primary"
            onClick={() => void submitPassword()}
            disabled={!currentPassword || !nextPassword}
          >
            Update password
          </button>
          {passwordNote && <span className="text-xs text-slate-400">{passwordNote}</span>}
        </div>
      </Card>

      <Card title="Preferences">
        <Field label="Currency" className="max-w-xs">
          <select
            className="field"
            value={data.currency}
            onChange={(e) => update((d) => void (d.currency = e.target.value))}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Expense categories">
          <div className="flex flex-wrap gap-2">
            {data.categories.expense.map((c) => (
              <span key={c} className="chip bg-slate-800 text-slate-300">
                {c}
                <button
                  className="ml-2 text-slate-500 hover:text-rose-400"
                  onClick={() => removeCategory('expense', c)}
                  aria-label={`Remove ${c}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="field"
              placeholder="New category"
              maxLength={30}
              value={newExpense}
              onChange={(e) => setNewExpense(e.target.value)}
            />
            <button
              className="btn-ghost"
              onClick={() => {
                addCategory('expense', newExpense)
                setNewExpense('')
              }}
            >
              Add
            </button>
          </div>
        </Card>

        <Card title="Income categories">
          <div className="flex flex-wrap gap-2">
            {data.categories.income.map((c) => (
              <span key={c} className="chip bg-slate-800 text-slate-300">
                {c}
                <button
                  className="ml-2 text-slate-500 hover:text-rose-400"
                  onClick={() => removeCategory('income', c)}
                  aria-label={`Remove ${c}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="field"
              placeholder="New category"
              maxLength={30}
              value={newIncome}
              onChange={(e) => setNewIncome(e.target.value)}
            />
            <button
              className="btn-ghost"
              onClick={() => {
                addCategory('income', newIncome)
                setNewIncome('')
              }}
            >
              Add
            </button>
          </div>
        </Card>
      </div>

      <Card title="Backup & restore">
        <p className="text-xs text-slate-400">
          Data last changed {formatDate(data.updatedAt.slice(0, 10))} · {data.transactions.length}{' '}
          transactions, {data.accounts.length} accounts, {data.investments.length} holdings,{' '}
          {data.loans.length} loans, {data.bills.length} bills, {data.gifts.length} gifts &amp;
          donations.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => downloadJson(`finance-backup-${today()}.json`, data)}>
            Download backup (JSON)
          </button>
          <button className="btn-ghost" onClick={() => fileInput.current?.click()}>
            Restore from file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importJson(file)
              e.target.value = ''
            }}
          />
          <ConfirmButton
            label="Erase all data"
            onConfirm={() =>
              update((d) => {
                d.transactions = []
                d.accounts = []
                d.budgets = []
                d.investments = []
                d.loans = []
                d.bills = []
              })
            }
          />
        </div>
      </Card>
    </div>
  )
}
