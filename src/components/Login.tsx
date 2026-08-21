import { useState, type FormEvent } from 'react'
import { useStore } from '../store/useStore'
import { passwordProblem } from '../lib/crypto'

export function Login() {
  const profile = useStore((s) => s.profile)
  const driveConnected = useStore((s) => s.driveConnected)
  const unlock = useStore((s) => s.unlock)
  const createAccount = useStore((s) => s.createAccount)
  const connectDrive = useStore((s) => s.connectDrive)
  const error = useStore((s) => s.error)
  const setError = useStore((s) => s.setError)

  const [username, setUsername] = useState(profile?.username ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const isNew = !profile

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (isNew) {
      const weakness = passwordProblem(password)
      if (weakness) return setError(weakness)
      if (password !== confirm) return setError('The two passwords do not match.')
    }
    setBusy(true)
    if (isNew) await createAccount(username, password)
    else await unlock(username, password)
    setBusy(false)
    setPassword('')
    setConfirm('')
  }

  const connect = async () => {
    setBusy(true)
    await connectDrive()
    setBusy(false)
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600/20 text-2xl">
            📊
          </div>
          <h1 className="text-2xl font-semibold">Personal Finance Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">
            {isNew
              ? 'Create the username and password that will unlock your dashboard.'
              : 'Sign in to unlock your dashboard.'}
          </p>
        </div>

        <form className="card space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="label">Username</span>
            <input
              className="field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={40}
              required
            />
          </label>

          <label className="block">
            <span className="label">Password</span>
            <input
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isNew ? 'new-password' : 'current-password'}
              required
            />
          </label>

          {isNew && (
            <label className="block">
              <span className="label">Confirm password</span>
              <input
                type="password"
                className="field"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
          )}

          <button className="btn-primary w-full" disabled={busy || !username || !password}>
            {busy ? 'Please wait…' : isNew ? 'Create account' : 'Sign in'}
          </button>

          {error && (
            <p className="rounded-xl border border-rose-900/60 bg-rose-950/40 p-3 text-xs text-rose-300">
              {error}
            </p>
          )}

          {isNew && (
            <p className="text-xs text-slate-500">
              Your password encrypts the file before it leaves this device, so nobody — not even
              Google — can read it. It cannot be reset, so store it safely.
            </p>
          )}
        </form>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-xs">
          {driveConnected ? (
            <p className="text-slate-400">Google Drive connected — your encrypted file syncs automatically.</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-[16rem] text-slate-400">
                {isNew
                  ? 'Connect the Google Drive that will store your encrypted file.'
                  : 'Not connected to Drive — you can still sign in and work offline.'}
              </p>
              <button type="button" className="btn-ghost" onClick={connect} disabled={busy}>
                Connect Drive
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
