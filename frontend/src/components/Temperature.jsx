import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.jsx'
import { useAsync } from '../hooks.js'
import { ActorSelect, ErrorBox, Empty, Spinner, Badge } from './common.jsx'
import { fmtAgo, tempColor, shorten } from '../utils.js'

function TempChart({ readings, range }) {
  if (!readings.length) return <p className="muted">No readings yet.</p>
  const values = readings.map((r) => r.temperature)
  const lo = Math.min(...values, range ? range.min : 0)
  const hi = Math.max(...values, range ? range.max : 1)
  const span = Math.max(hi - lo, 1)
  return (
    <div className="temp-chart">
      {readings.map((r, i) => {
        const h = 20 + ((r.temperature - lo) / span) * 60
        return (
          <div key={i} className="temp-bar-wrap" title={`${r.temperature}°C · ${r.location}`}>
            <span className={r.alert ? 'temp-bar alert' : 'temp-bar'} style={{ height: h + 'px' }} />
          </div>
        )
      })}
    </div>
  )
}

export default function Temperature() {
  const { actors, notify, refresh, refreshSignal } = useApp()
  const [{ loading, data, error }, reload] = useAsync(async () => {
    const { items } = await api.items()
    const monitored = items.filter((i) => i.hasTempRange)
    const rows = await Promise.all(
      monitored.map((i) => api.temperature(i.id).then((d) => ({ item: i, ...d.temperature })))
    )
    return { all: items, monitored: rows }
  }, [refreshSignal])

  const [selected, setSelected] = useState('')
  const [temp, setTemp] = useState('5')
  const [location, setLocation] = useState('Cold storage checkpoint')
  const [actorIndex, setActorIndex] = useState(6)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!selected && data?.monitored?.length) setSelected(String(data.monitored[0].item.id))
  }, [data, selected])

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

  const submitReading = (e) => {
    e.preventDefault()
    if (!selected) return
    run('Temperature recorded on-chain', () =>
      api.addTemperature(selected, { actorIndex, temperature: Number(temp), location })
    )
  }

  const simulateIoT = () => {
    if (!selected) return
    const row = data.monitored.find((m) => m.item.id === Number(selected))
    if (!row) return
    const { min, max } = row.range
    const breach = Math.random() < 0.35
    const value = breach
      ? (Math.random() < 0.5 ? min - 1 - Math.random() * 4 : max + 1 + Math.random() * 4)
      : min + Math.random() * (max - min)
    const rounded = Math.round(value * 10) / 10
    run('IoT sensor reading recorded', () =>
      api.addTemperature(selected, { actorIndex, temperature: rounded, location: 'IoT sensor · truck T-' + Math.floor(Math.random() * 900 + 100) })
    )
  }

  const monitored = data?.monitored || []
  const totals = monitored.reduce(
    (acc, m) => {
      acc.alerts += m.alertCount
      acc.readings += m.readings.length
      return acc
    },
    { alerts: 0, readings: 0 }
  )

  return (
    <div>
      <section className="card-panel">
        <h3>Smart Temperature Monitoring</h3>
        <p className="muted">Continuous cold-chain tracking for medicines, dairy and frozen goods. Out-of-range readings raise alerts and are permanently recorded on-chain.</p>
        <div className="stat-row">
          <div className="stat"><span className="stat-num">{monitored.length}</span><span className="stat-label">Monitored products</span></div>
          <div className="stat"><span className="stat-num">{totals.readings}</span><span className="stat-label">Readings</span></div>
          <div className="stat"><span className="stat-num" style={{ color: '#ef4444' }}>{totals.alerts}</span><span className="stat-label">Alerts</span></div>
        </div>
      </section>

      <section className="card-panel">
        <h3>Record a reading</h3>
        <form className="inline-row" onSubmit={submitReading}>
          <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select product...</option>
            {monitored.map((m) => (
              <option key={m.item.id} value={m.item.id}>#{m.item.id} · {m.item.name}</option>
            ))}
          </select>
          <input className="num" type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} />
          <span className="muted">°C at</span>
          <input className="wide" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <ActorSelect value={actorIndex} onChange={setActorIndex} />
          <button className="btn primary" type="submit" disabled={busy || !selected}>Record</button>
          <button className="btn" type="button" onClick={simulateIoT} disabled={busy || !selected}>Simulate IoT sensor</button>
        </form>
      </section>

      {loading && !data && <Spinner />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {data && monitored.length === 0 && <Empty>No products have a temperature range configured. Set limits when registering a product.</Empty>}

      <div className="grid">
        {monitored.map((m) => (
          <article className="card" key={m.item.id}>
            <div className="card-body">
              <div className="row-between">
                <h4>#{m.item.id} · {m.item.name}</h4>
                <Badge color={tempColor(m.status)}>{m.status}</Badge>
              </div>
              <p className="meta">Limits: {m.range.min}°C to {m.range.max}°C · {shorten(m.item.currentOwner)}</p>
              <TempChart readings={m.readings} range={m.range} />
              <div className="mini-summary">
                <span>Min {m.min ?? '-'}°C</span>
                <span>Max {m.max ?? '-'}°C</span>
                <span className={m.alertCount ? 'danger' : ''}>{m.alertCount} alerts</span>
              </div>
              {m.alerts.length > 0 && (
                <ul className="alert-list">
                  {m.alerts.slice(-3).map((a, i) => (
                    <li key={i}>⚠️ {a.temperature}°C at {a.location} · {fmtAgo(a.timestamp)}</li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
