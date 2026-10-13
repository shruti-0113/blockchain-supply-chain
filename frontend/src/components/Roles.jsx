import { useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.jsx'
import { useAsync } from '../hooks.js'
import { ErrorBox, Empty, Spinner, Badge, Bar } from './common.jsx'
import { shorten } from '../utils.js'

const ROLE_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Manufacturer' },
  { value: 2, label: 'Distributor' },
  { value: 3, label: 'Retailer' },
  { value: 4, label: 'Customer' },
  { value: 5, label: 'Admin' },
  { value: 6, label: 'Carrier' }
]

const CAPABILITIES = {
  Manufacturer: 'Create products, ship them and request transfers.',
  Distributor: 'Accept transfers, receive and distribute goods.',
  Retailer: 'Receive goods, confirm transfers and deliver to customers.',
  Customer: 'Verify product passports and record scans.',
  Admin: 'Assign roles and review suspicious events / disputes.',
  Carrier: 'Record temperature checkpoints and transport legs.',
  None: 'No permissions assigned.'
}

export default function Roles() {
  const { actors, notify, refresh, refreshSignal } = useApp()
  const [{ loading, data, error }, reload] = useAsync(() => api.reputation(), [refreshSignal])
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(false)

  const run = async (label, fn) => {
    setBusy(true)
    try {
      await fn()
      notify(label + ' ✓', 'success')
      refresh()
      reload()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const assign = (actor) => {
    const role = drafts[actor.index] ?? actor.role
    run(`Role updated for ${actor.label}`, () => api.assignRole({ actorIndex: 0, account: actor.address, role }))
  }

  const dispute = (supplier) => {
    const reason = window.prompt('Dispute reason:', 'Late delivery') || 'Unspecified'
    run('Dispute recorded', () => api.dispute({ actorIndex: 0, supplier: supplier.address, reason }))
  }

  const suppliers = data?.suppliers || []

  return (
    <div>
      <section className="card-panel">
        <h3>Role-Based Access Control</h3>
        <p className="muted">The contract enforces who can perform each action. Only an admin can (re)assign roles.</p>
        <div className="role-grid">
          {actors.map((a) => (
            <div className="role-card" key={a.index}>
              <div className="row-between">
                <strong>{a.label}</strong>
                <Badge color="#6366f1">{a.roleName}</Badge>
              </div>
              <p className="mono small">{shorten(a.address)}</p>
              <p className="muted small">{CAPABILITIES[a.roleName]}</p>
              <div className="inline-row tight">
                <select
                  className="select"
                  value={drafts[a.index] ?? a.role}
                  onChange={(e) => setDrafts((d) => ({ ...d, [a.index]: Number(e.target.value) }))}
                >
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button className="btn small" disabled={busy} onClick={() => assign(a)}>Assign role</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card-panel">
        <h3>Supplier Reputation</h3>
        <p className="muted">Reliability is computed on-chain from confirmed deliveries and recorded disputes.</p>
        {loading && !data && <Spinner />}
        {error && <ErrorBox>{error}</ErrorBox>}
        {data && suppliers.length === 0 && <Empty>No suppliers yet.</Empty>}
        <div className="list">
          {suppliers.map((s) => (
            <div className="rep-row" key={s.address}>
              <div className="rep-main">
                <div className="row-between">
                  <strong>{s.label} <span className="muted">· {s.roleName}</span></strong>
                  <span className="rep-score" style={{ color: s.reliability >= 70 ? '#10b981' : s.reliability >= 40 ? '#f59e0b' : '#ef4444' }}>{s.reliability}%</span>
                </div>
                <Bar value={s.reliability} max={100} color={s.reliability >= 70 ? '#10b981' : s.reliability >= 40 ? '#f59e0b' : '#ef4444'} />
                <p className="meta">Confirmed deliveries: {s.deliveries} · Disputes: {s.disputes}{s.disputes ? ' ⚠️' : ''}</p>
              </div>
              <button className="btn small ghost" disabled={busy} onClick={() => dispute(s)}>Raise dispute</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
