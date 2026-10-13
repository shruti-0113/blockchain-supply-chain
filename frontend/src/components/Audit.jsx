import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.jsx'
import { useAsync } from '../hooks.js'
import { ErrorBox, Empty, Spinner } from './common.jsx'
import { EVENT_META, fmtTime, shorten } from '../utils.js'

export default function Audit() {
  const { refreshSignal, notify, refresh } = useApp()
  const { data: itemsData } = useAsync(() => api.items(), [refreshSignal])
  const [itemId, setItemId] = useState('')

  useEffect(() => {
    if (!itemId && itemsData?.items?.length) setItemId(String(itemsData.items[0].id))
  }, [itemsData, itemId])

  const [{ loading, data, error }, reload] = useAsync(
    () => (itemId ? api.checkpoints(itemId) : Promise.resolve({ checkpoints: [] })),
    [itemId, refreshSignal]
  )
  const [verify, setVerify] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tamperIndex, setTamperIndex] = useState('0')

  useEffect(() => {
    setVerify(null)
  }, [itemId])

  const run = async (label, fn) => {
    setBusy(true)
    try {
      await fn()
      notify(label + ' ✓', 'success')
      reload()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const doVerify = async () => {
    try {
      const r = await api.verify(itemId)
      setVerify(r)
      notify(r.valid ? 'Record chain is valid' : 'Record chain INVALID — tampering detected', r.valid ? 'success' : 'error')
    } catch (e) {
      notify(e.message, 'error')
    }
  }

  const tamper = () => run('Checkpoint tampered (demo)', () => api.tamper(itemId, { actorIndex: 0, index: Number(tamperIndex), newData: 'TAMPERED BY ATTACKER' }))
  const untamper = () => run('Checkpoint restored', () => api.untamper(itemId, { actorIndex: 0, index: Number(tamperIndex) }))

  const items = itemsData?.items || []
  const checkpoints = data?.checkpoints || []

  return (
    <div>
      <section className="card-panel">
        <h3>Tamper Detection & Audit Trail</h3>
        <p className="muted">Every event stores the previous record’s hash and its own hash. Recomputing the chain proves whether any record was modified after it was written.</p>
        <div className="inline-row">
          <select className="select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select product...</option>
            {items.map((i) => <option key={i.id} value={i.id}>#{i.id} · {i.name}</option>)}
          </select>
          <button className="btn primary" onClick={doVerify} disabled={!itemId}>Verify Record Integrity</button>
          <input className="num" type="number" value={tamperIndex} onChange={(e) => setTamperIndex(e.target.value)} title="checkpoint index" />
          <button className="btn ghost" onClick={tamper} disabled={!itemId || busy}>Simulate tamper</button>
          <button className="btn ghost" onClick={untamper} disabled={!itemId || busy}>Restore</button>
        </div>

        {verify && (
          <div className={verify.valid ? 'alert-box ok' : 'alert-box danger'}>
            {verify.valid
              ? `✅ Record chain valid — ${verify.length} checkpoints verified.`
              : '⛔ Record chain is INVALID — a stored record was modified after being written.'}
          </div>
        )}
      </section>

      {loading && <Spinner />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {!itemId && <Empty>Select a product to inspect its audit trail.</Empty>}

      {itemId && (
        <ol className="chain">
          {checkpoints.map((cp) => {
            const meta = EVENT_META[cp.type] || { icon: '•', color: '#64748b' }
            return (
              <li key={cp.index} className={cp.tampered ? 'chain-item tampered' : 'chain-item'}>
                <div className="chain-index" style={{ borderColor: meta.color }}>{meta.icon}<small>#{cp.index}</small></div>
                <div className="chain-body">
                  <div className="tl-head">
                    <strong>{meta.label}{cp.tampered ? ' · TAMPERED' : ''}</strong>
                    <small>{fmtTime(cp.timestamp)} · by {shorten(cp.actor)}</small>
                  </div>
                  {cp.data && <p className="tl-data">{cp.data}</p>}
                  {cp.hasTemperature && <p className={cp.tempAlert ? 'tl-temp alert' : 'tl-temp'}>{cp.temperature}°C</p>}
                  <div className="hash-row">
                    <span className="hash prev" title={cp.prevHash}>prev {cp.prevHash.slice(0, 12)}…</span>
                    <span className="hash-link">→</span>
                    <span className="hash" title={cp.recordHash}>hash {cp.recordHash.slice(0, 12)}…</span>
                  </div>
                </div>
              </li>
            )
          })}
          {checkpoints.length === 0 && !loading && <Empty>No checkpoints.</Empty>}
        </ol>
      )}
    </div>
  )
}
