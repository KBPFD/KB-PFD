import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Login } from './components/Login'
import { useStore } from './store/useStore'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Accounts } from './pages/Accounts'
import { Budgets } from './pages/Budgets'
import { Investments } from './pages/Investments'
import { Loans } from './pages/Loans'
import { Bills } from './pages/Bills'
import { Policies } from './pages/Policies'
import { Gifts } from './pages/Gifts'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'

export default function App() {
  const ready = useStore((s) => s.ready)
  const unlocked = useStore((s) => s.unlocked)
  const init = useStore((s) => s.init)
  const push = useStore((s) => s.push)
  const dirty = useStore((s) => s.dirty)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    const flush = () => {
      if (useStore.getState().dirty && useStore.getState().unlocked) void push()
    }
    window.addEventListener('visibilitychange', flush)
    return () => window.removeEventListener('visibilitychange', flush)
  }, [push])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!ready) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-slate-400">Loading…</div>
    )
  }

  if (!unlocked) return <Login />

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="investments" element={<Investments />} />
          <Route path="loans" element={<Loans />} />
          <Route path="bills" element={<Bills />} />
          <Route path="policies" element={<Policies />} />
          <Route path="gifts" element={<Gifts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
