import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import { AppContext } from './context.jsx'
import Dashboard from './components/Dashboard.jsx'
import Products from './components/Products.jsx'
import Passport from './components/Passport.jsx'
import Temperature from './components/Temperature.jsx'
import Authenticity from './components/Authenticity.jsx'
import Transfers from './components/Transfers.jsx'
import Predictions from './components/Predictions.jsx'
import Carbon from './components/Carbon.jsx'
import Audit from './components/Audit.jsx'
import Roles from './components/Roles.jsx'
import './styles.css'

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'products', label: 'Products', icon: '📦' },
  { key: 'passport', label: 'Product Passport', icon: '🔗' },
  { key: 'temperature', label: 'Temperature', icon: '🌡️' },
  { key: 'authenticity', label: 'Authenticity', icon: '🛡️' },
  { key: 'transfers', label: 'Transfers', icon: '🔁' },
  { key: 'predictions', label: 'AI Prediction', icon: '🤖' },
  { key: 'carbon', label: 'Carbon', icon: '🌿' },
  { key: 'audit', label: 'Audit Trail', icon: '🧾' },
  { key: 'roles', label: 'Roles & Reputation', icon: '👥' }
]

const PANELS = {
  dashboard: Dashboard,
  products: Products,
  passport: Passport,
  temperature: Temperature,
  authenticity: Authenticity,
  transfers: Transfers,
  predictions: Predictions,
  carbon: Carbon,
  audit: Audit,
  roles: Roles
}

function App() {
  const [tab, setTab] = useState('dashboard')
  const [actors, setActors] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [toast, setToast] = useState(null)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [health, setHealth] = useState(null)

  const notify = useCallback((message, type = 'info') => {
    setToast({ message, type })
    window.clearTimeout(notify._t)
    notify._t = window.setTimeout(() => setToast(null), 4200)
  }, [])

  const refresh = useCallback(() => setRefreshSignal((x) => x + 1), [])

  const goToPassport = useCallback((id) => {
    setSelectedId(id)
    setTab('passport')
  }, [])

  const loadActors = useCallback(async () => {
    try {
      const d = await api.actors()
      setActors(d.actors)
    } catch (e) {
      /* backend may still be starting */
    }
  }, [])

  useEffect(() => {
    loadActors()
    api.health().then(setHealth).catch(() => setHealth({ ok: false }))
  }, [loadActors, refreshSignal])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('pid')
    if (pid && !Number.isNaN(Number(pid))) {
      setSelectedId(Number(pid))
      setTab('passport')
    }
  }, [])

  const ActivePanel = PANELS[tab]

  const value = {
    actors,
    selectedId,
    setSelectedId,
    goToPassport,
    notify,
    refresh,
    refreshSignal
  }

  return (
    <AppContext.Provider value={value}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="logo">⛓️</span>
            <div>
              <h1>ChainTrace</h1>
              <p>Blockchain Supply Chain & Product Passport</p>
            </div>
          </div>
          <div className="wallet">
            <span className={health && health.ok ? 'pill connected' : 'pill'}>
              ● {health ? (health.ok ? `Chain online · ${health.itemCount} products` : 'Backend offline') : 'Connecting...'}
            </span>
          </div>
        </header>

        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              onClick={() => setTab(t.key)}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>

        {toast && <div className={'toast ' + toast.type}>{toast.message}</div>}

        <main className="panel-area">
          <ActivePanel />
        </main>

        <footer className="footer">
          Local Hardhat network · All records are stored on-chain with a hash-linked audit trail.
        </footer>
      </div>
    </AppContext.Provider>
  )
}

export default App
