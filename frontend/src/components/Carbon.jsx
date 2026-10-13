import { useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.jsx'
import { useAsync } from '../hooks.js'
import { ActorSelect, ErrorBox, Empty, Spinner, Bar } from './common.jsx'

const MODES = ['truck', 'van', 'rail', 'ship', 'air', 'drone', 'bike']
const MODE_COLORS = { truck: '#6366f1', van: '#8b5cf6', rail: '#0ea5e9', ship: '#14b8a6', air: '#ef4444', drone: '#f59e0b', bike: '#22c55e' }

export default function Carbon() {
  const { notify, refresh, refreshSignal } = useApp()
  const [{ loading, data, error }, reload] = useAsync(() => api.carbonAll(), [refreshSignal])
  const { data: itemsData } = useAsync(() => api.items(), [refreshSignal])

  const [itemId, setItemId] = useState('')
  const [leg, setLeg] = useState({ from: 'Factory', to: 'Warehouse', distanceKm: 120, mode: 'truck' })
  const [actorIndex, setActorIndex] = useState(6)
  const [busy, setBusy] = useState(false)

  const set = (k, v) => setLeg((l) => ({ ...l, [k]: v }))

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

  const addLeg = (e) => {
    e.preventDefault()
    if (!itemId) return notify('Select a product', 'error')
    run('Transport leg recorded', () => api.leg(itemId, { actorIndex, ...leg, distanceKm: Number(leg.distanceKm) }))
  }

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox>{error}</ErrorBox>
  if (!data) return <Empty />

  const maxKg = Math.max(1, ...data.perItem.map((p) => p.totalKg))
  const items = itemsData?.items || []
  const factorTable = data.perItem[0]?.factorTable || {}

  return (
    <div>
      <section className="card-panel">
        <h3>Carbon Footprint Tracker</h3>
        <p className="muted">Estimated emissions are derived from each shipment’s distance and transport mode, recorded on-chain as transport legs.</p>
        <div className="stat-row">
          <div className="stat"><span className="stat-num" style={{ color: '#22c55e' }}>{data.totalKg}</span><span className="stat-label">kg CO₂ total</span></div>
          <div className="stat"><span className="stat-num">{data.totalKm}</span><span className="stat-label">km travelled</span></div>
          <div className="stat"><span className="stat-num">{Math.round(data.totalKg / 21)}</span><span className="stat-label">trees/yr to offset</span></div>
        </div>
      </section>

      <section className="card-panel">
        <h3>Add a transport leg</h3>
        <form className="inline-row" onSubmit={addLeg}>
          <select className="select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select product...</option>
            {items.map((i) => <option key={i.id} value={i.id}>#{i.id} · {i.name}</option>)}
          </select>
          <input className="sm" placeholder="From" value={leg.from} onChange={(e) => set('from', e.target.value)} />
          <input className="sm" placeholder="To" value={leg.to} onChange={(e) => set('to', e.target.value)} />
          <input className="num" type="number" value={leg.distanceKm} onChange={(e) => set('distanceKm', e.target.value)} />
          <span className="muted">km</span>
          <select className="select" value={leg.mode} onChange={(e) => set('mode', e.target.value)}>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <ActorSelect value={actorIndex} onChange={setActorIndex} />
          <button className="btn primary" type="submit" disabled={busy || !itemId}>Record leg</button>
        </form>
      </section>

      <div className="two-col">
        <section className="card-panel">
          <h3>Per-product footprint</h3>
          {data.perItem.length === 0 && <Empty>No shipments tracked yet.</Empty>}
          {data.perItem.map((p) => (
            <div className="bar-row" key={p.id}>
              <span className="bar-label">#{p.id} {p.name}</span>
              <Bar value={p.totalKg} max={maxKg} color="#22c55e" />
              <span className="bar-value">{p.totalKg} kg</span>
            </div>
          ))}
        </section>

        <section className="card-panel">
          <h3>Emission factors</h3>
          <table className="table">
            <thead><tr><th>Mode</th><th>kg CO₂ / km</th></tr></thead>
            <tbody>
              {Object.entries(factorTable).map(([mode, f]) => (
                <tr key={mode}>
                  <td><span className="dot-swatch" style={{ background: MODE_COLORS[mode] || '#64748b' }} /> {mode}</td>
                  <td>{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
