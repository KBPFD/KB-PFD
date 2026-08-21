import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../store/useStore'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '🏠', end: true },
  { to: '/transactions', label: 'Transactions', icon: '💸' },
  { to: '/accounts', label: 'Accounts', icon: '🏦' },
  { to: '/budgets', label: 'Budgets', icon: '🎯' },
  { to: '/investments', label: 'Investments', icon: '📈' },
  { to: '/loans', label: 'Loans', icon: '🏷️' },
  { to: '/bills', label: 'Bills', icon: '🔁' },
  { to: '/policies', label: 'Policies', icon: '🛡️' },
  { to: '/gifts', label: 'Gifts', icon: '🎁' },
  { to: '/reports', label: 'Reports', icon: '📄' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

function SyncBadge() {
  const sync = useStore((s) => s.sync)
  const dirty = useStore((s) => s.dirty)
  const driveConnected = useStore((s) => s.driveConnected)
  const push = useStore((s) => s.push)

  if (!driveConnected) {
    return (
      <span className="chip whitespace-nowrap bg-amber-900/40 text-amber-300">
        <span className="hidden sm:inline">On this&nbsp;</span>device
      </span>
    )
  }

  const map = {
    loading: { text: 'Loading…', cls: 'bg-slate-800 text-slate-300' },
    saving: { text: 'Saving…', cls: 'bg-brand-900/50 text-brand-300' },
    error: { text: 'Sync failed', cls: 'bg-rose-900/40 text-rose-300' },
    offline: { text: 'Offline', cls: 'bg-amber-900/40 text-amber-300' },
    idle: dirty
      ? { text: 'Unsaved', cls: 'bg-amber-900/40 text-amber-300' }
      : { text: 'Synced', cls: 'bg-emerald-900/40 text-emerald-300' },
  } as const

  const state = map[sync]
  return (
    <button
      className={`chip whitespace-nowrap ${state.cls}`}
      onClick={() => void push()}
      title="Sync with Google Drive"
    >
      {state.text}
    </button>
  )
}

export function Layout() {
  const driveConnected = useStore((s) => s.driveConnected)
  const profile = useStore((s) => s.profile)
  const lock = useStore((s) => s.lock)
  const connectDrive = useStore((s) => s.connectDrive)
  const error = useStore((s) => s.error)
  const clearError = useStore((s) => s.setError)

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="hidden w-60 shrink-0 border-r border-slate-800 bg-slate-900/40 p-4 lg:block">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="text-xl">📊</span>
          <span className="text-sm font-semibold">Finance</span>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  isActive ? 'bg-brand-600/20 text-brand-200' : 'text-slate-400 hover:bg-slate-800/60'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/90 px-3 py-2 backdrop-blur sm:gap-3 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="text-lg">📊</span>
            <span className="text-sm font-semibold">Finance</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex shrink-0 items-center gap-2">
            <SyncBadge />
            {!driveConnected && (
              <button
                className="btn-ghost whitespace-nowrap px-2 py-1 text-xs sm:px-3"
                onClick={() => void connectDrive()}
              >
                <span className="hidden sm:inline">Connect&nbsp;</span>Drive
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs">
                {(profile?.username ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden text-xs text-slate-400 sm:block">{profile?.username}</span>
              <button
                className="btn-ghost shrink-0 px-2 py-1 text-xs sm:px-3"
                onClick={lock}
                title="Lock the dashboard"
              >
                Lock
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="flex items-start justify-between gap-3 border-b border-rose-900/60 bg-rose-950/40 px-4 py-2 text-xs text-rose-200">
            <span>{error}</span>
            <button onClick={() => clearError(null)} className="shrink-0 underline">
              dismiss
            </button>
          </div>
        )}

        <main className="flex-1 p-4 pb-24 lg:pb-8">
          <Outlet />
        </main>

        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur lg:hidden">
          <nav className="flex snap-x overflow-x-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-w-[4.5rem] flex-1 snap-start flex-col items-center gap-0.5 px-2 py-2 text-[10px] ${
                    isActive ? 'text-brand-300' : 'text-slate-500'
                  }`
                }
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
          {/* hints that the tab strip scrolls past the visible tabs */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-950 to-transparent" />
        </div>
      </div>
    </div>
  )
}
