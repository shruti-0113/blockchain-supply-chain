import { useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.jsx'
import { useAsync } from '../hooks.js'
import { ErrorBox, Empty, Spinner, Badge } from './common.jsx'
import { fmtAgo, shorten } from '../utils.js'

const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad']

export default function Authenticity() {
  const { actors, notify, refresh, refreshSignal } = useApp()
  const [{ loading, data, error }, reload] = useAsync(() => api.authenticityAll(), [refreshSignal])
  const [verifyId, setVerifyId] = useState('')
  const [result, setResult] = useState(null)
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

  const verify = async () => {
    setBusy(true)
    setResult(null)
    try {
      const d = await api.authenticity(verifyId)
      setResult(d)
    } catch (e) {
      if (e.status === 404) {
        setResult({ notFound: true, authentic: false, message: e.data?.message || 'Product not found. Possible counterfeit.' })
      } else {
        notify(e.message, 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const actorFor = (addr) => actors.find((a) => a.address.toLowerCase() === (addr || '').toLowerCase())?.index ?? 5

  const recordScan = (item, location) => {
    run(`Scan recorded for #${item.id} @ ${location}`, () => api.scan(item.id, { actorIndex: actorFor(item.currentOwner), location }))
  }

  const simulateSuspicious = (item) => {
    const picks = [...CITIES].sort(() => Math.random() - 0.5).slice(0, 4)
    run('Suspicious scan pattern simulated', async () => {
      for (const c of picks) {
        await api.scan(item.id, { actorIndex: actorFor(item.currentOwner), location: c })
      }
    })
  }

  const items = data?.items || []

  return (
    <div>
      <section className="card-panel">
        <h3>Fake Product Detection</h3>
        <p className="muted">Every product has a unique SKU and QR. Duplicate IDs are blocked on-chain and repeated scans from many locations raise a suspicious-activity alert. Note: blockchain proves the record’s integrity, not that the physical item is genuine.</p>
        <div className="inline-row">
          <input className="num" placeholder="Enter product ID" value={verifyId} onChange={(e) => setVerifyId(e.target.value)} />
          <button className="btn primary" onClick={verify} disabled={busy || !verifyId}>Verify product</button>
        </div>

        {result && result.notFound && (
          <div className="alert-box danger">⛔ {result.message}</div>
        )}
        {result && result.authentic && (
          <div className={result.scans.suspicious ? 'alert-box warn' : 'alert-box ok'}>
            {result.scans.suspicious ? '⚠️' : '✅'} {result.message}
            <div className="scan-locs">
              {Object.entries(result.scans.locations).map(([loc, n]) => (
                <span className="chip tiny" key={loc}>{loc}: {n}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="stat-row">
        <div className="stat"><span className="stat-num">{items.length}</span><span className="stat-label">Registered products</span></div>
        <div className="stat"><span className="stat-num" style={{ color: '#ec4899' }}>{data?.suspiciousCount ?? 0}</span><span className="stat-label">Suspicious</span></div>
      </div>

      {loading && !data && <Spinner />}
      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="grid">
        {items.map((row) => (
          <article className="card" key={row.item.id}>
            <div className="card-body">
              <div className="row-between">
                <h4>#{row.item.id} · {row.item.name}</h4>
                {row.scans.suspicious ? <Badge color="#ec4899">SUSPICIOUS</Badge> : <Badge color="#10b981">CLEAR</Badge>}
              </div>
              <p className="sku">SKU: {row.item.sku}</p>
              <p className="meta">Scans: {row.scans.count} · Locations: {row.scans.uniqueLocations}</p>
              <div className="scan-locs">
                {Object.entries(row.scans.locations).map(([loc, n]) => (
                  <span className="chip tiny" key={loc}>{loc}: {n}</span>
                ))}
              </div>
              {row.scans.suspicious && (
                <ul className="alert-list">
                  {row.scans.reasons.map((r, i) => <li key={i}>⚠️ {r}</li>)}
                </ul>
              )}
              <div className="actions">
                <button className="btn small" onClick={() => recordScan(row.item, 'Verified retail counter')}>Record scan</button>
                <button className="btn small ghost" onClick={() => simulateSuspicious(row.item)}>Simulate duplicate scans</button>
              </div>
            </div>
          </article>
        ))}
        {items.length === 0 && !loading && <Empty>No products registered yet.</Empty>}
      </div>
    </div>
  )
}
