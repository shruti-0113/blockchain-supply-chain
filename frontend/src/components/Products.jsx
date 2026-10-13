import { useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.jsx'
import { useAsync } from '../hooks.js'
import { ActorSelect, ErrorBox, Empty, Spinner } from './common.jsx'
import { STATES, STATE_COLORS, PRESET_IMAGES, FALLBACK_IMG, shorten } from '../utils.js'

const TEMP_PRESETS = [
  { label: 'Ambient', min: 15, max: 25 },
  { label: 'Cold chain', min: 2, max: 8 },
  { label: 'Frozen', min: -20, max: -10 }
]

export default function Products() {
  const { actors, notify, refresh, refreshSignal, goToPassport } = useApp()
  const [{ loading, data, error }, reload] = useAsync(() => api.items(), [refreshSignal])
  const [busy, setBusy] = useState(false)

  const [actorIndex, setActorIndex] = useState(1)
  const [form, setForm] = useState({
    sku: '',
    name: '',
    description: '',
    imageUrl: '',
    category: 'General',
    origin: '',
    tempMin: 0,
    tempMax: 0
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

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

  const createItem = (e) => {
    e.preventDefault()
    if (!form.name) return notify('Name is required', 'error')
    run('Product registered on-chain', async () => {
      await api.createItem({ actorIndex, ...form })
      setForm({ sku: '', name: '', description: '', imageUrl: '', category: 'General', origin: '', tempMin: 0, tempMax: 0 })
    })
  }

  const actorForAddress = (addr) =>
    actors.find((a) => a.address.toLowerCase() === (addr || '').toLowerCase())?.index

  const quickScan = (item) => {
    const location = window.prompt('Scan location:', 'Retail store')
    if (!location) return
    run('Scan recorded', () => api.scan(item.id, { actorIndex: actorForAddress(item.currentOwner) ?? 5, location }))
  }

  const items = data?.items || []

  return (
    <div>
      <section className="card-panel">
        <h3>Register New Product</h3>
        <form onSubmit={createItem}>
          <div className="form-grid">
            <input placeholder="Product name (e.g. Vaccine Batch A)" value={form.name} onChange={(e) => set('name', e.target.value)} />
            <input placeholder="SKU / unique product ID (auto if blank)" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
            <input placeholder="Manufacture origin (city, country)" value={form.origin} onChange={(e) => set('origin', e.target.value)} />
            <input placeholder="Description" value={form.description} onChange={(e) => set('description', e.target.value)} />
            <input placeholder="Image URL (or pick below)" value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} />
            <select className="select" value={form.category} onChange={(e) => set('category', e.target.value)}>
              {PRESET_IMAGES.map((p) => (
                <option key={p.label} value={p.label}>{p.label}</option>
              ))}
              <option value="General">General</option>
            </select>
          </div>

          <div className="presets">
            {PRESET_IMAGES.map((p) => (
              <button type="button" key={p.label} className="chip" onClick={() => { set('imageUrl', p.url); set('category', p.label) }}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="inline-row">
            <label className="field-label">Temperature limits (°C)</label>
            <input className="num" type="number" step="0.5" value={form.tempMin} onChange={(e) => set('tempMin', e.target.value)} />
            <span className="muted">to</span>
            <input className="num" type="number" step="0.5" value={form.tempMax} onChange={(e) => set('tempMax', e.target.value)} />
            {TEMP_PRESETS.map((p) => (
              <button type="button" key={p.label} className="chip" onClick={() => { set('tempMin', p.min); set('tempMax', p.max) }}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="form-actions">
            {form.imageUrl && (
              <img className="preview" src={form.imageUrl} alt="preview" onError={(e) => (e.target.src = FALLBACK_IMG)} />
            )}
            <ActorSelect value={actorIndex} onChange={setActorIndex} filterRole={1} />
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Recording...' : 'Register on Blockchain'}
            </button>
          </div>
        </form>
      </section>

      <section className="inventory">
        <div className="inventory-head">
          <h3>Inventory ({items.length})</h3>
        </div>
        {loading && !data && <Spinner />}
        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="grid">
          {items.map((item) => {
            const ownerIdx = actorForAddress(item.currentOwner)
            const actions = []
            if (item.state === 0) actions.push({ label: 'Ship', action: 'ship' })
            if (item.state === 1) actions.push({ label: 'Receive', action: 'receive' })
            if (item.state === 2) actions.push({ label: 'Distribute', action: 'distribute' })
            if (item.state === 3) actions.push({ label: 'Deliver', action: 'deliver' })
            return (
              <article className="card" key={item.id}>
                <div className="thumb">
                  <img src={item.imageUrl || FALLBACK_IMG} alt={item.name} onError={(e) => (e.target.src = FALLBACK_IMG)} />
                  <span className="badge" style={{ background: STATE_COLORS[item.state] }}>{STATES[item.state]}</span>
                </div>
                <div className="card-body">
                  <h4>#{item.id} · {item.name}</h4>
                  <p className="sku">SKU: {item.sku}</p>
                  <p className="desc">{item.description || 'No description provided.'}</p>
                  <div className="progress">
                    {STATES.map((_, i) => (
                      <span key={i} className={i <= item.state ? 'dot on' : 'dot'} style={i <= item.state ? { background: STATE_COLORS[item.state] } : {}} />
                    ))}
                  </div>
                  <p className="meta">Origin: {item.origin || '-'}</p>
                  <p className="meta">Owner: {shorten(item.currentOwner)}</p>
                  {item.hasTempRange && <p className="meta">Temp: {item.tempMin}°C to {item.tempMax}°C</p>}
                  <div className="actions">
                    {actions.map((a) => (
                      <button
                        key={a.action}
                        className="btn small"
                        disabled={busy || ownerIdx === undefined}
                        title={ownerIdx === undefined ? 'Current owner is not a known actor' : ''}
                        onClick={() => run(a.label + ' (#' + item.id + ')', () => api.setState(item.id, { actorIndex: ownerIdx, action: a.action }))}
                      >
                        {a.label}
                      </button>
                    ))}
                    <button className="btn small" onClick={() => goToPassport(item.id)}>Passport</button>
                    <button className="btn small ghost" onClick={() => quickScan(item)}>Scan</button>
                  </div>
                </div>
              </article>
            )
          })}
          {items.length === 0 && !loading && <Empty>No products yet. Register one above.</Empty>}
        </div>
      </section>
    </div>
  )
}
