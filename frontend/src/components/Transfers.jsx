import { useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../context.jsx'
import { useAsync } from '../hooks.js'
import { ActorSelect, ErrorBox, Empty, Spinner, Badge } from './common.jsx'
import { STATES, STATE_COLORS, fmtTime, shorten } from '../utils.js'

export default function Transfers() {
  const { actors, notify, refresh, refreshSignal } = useApp()
  const [{ loading, data, error }, reload] = useAsync(async () => {
    const { items } = await api.items()
    const withTx = await Promise.all(
      items.map((i) => api.transfer(i.id).then((d) => ({ item: i, transfer: d.transfer })).catch(() => ({ item: i, transfer: null })))
    )
    return { rows: withTx }
  }, [refreshSignal])

  const [itemId, setItemId] = useState('')
  const [receiver, setReceiver] = useState(3)
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

  const actorFor = (addr) => actors.find((a) => a.address.toLowerCase() === (addr || '').toLowerCase())?.index

  const rows = data?.rows || []
  const receiverActor = actors.find((a) => a.index === receiver)

  const requestTransfer = (e) => {
    e.preventDefault()
    const row = rows.find((r) => r.item.id === Number(itemId))
    if (!row) return notify('Select a product', 'error')
    const ownerIdx = actorFor(row.item.currentOwner)
    if (ownerIdx === undefined) return notify('Current owner is not a known actor', 'error')
    run('Transfer requested', () => api.requestTransfer(row.item.id, { actorIndex: ownerIdx, to: receiverActor.address }))
  }

  return (
    <div>
      <section className="card-panel">
        <h3>Smart Contract Ownership Transfer</h3>
        <p className="muted">Ownership moves manufacturer → distributor → retailer only after the receiver confirms. Without that authorised confirmation, the contract will not update the owner.</p>
        <form className="inline-row" onSubmit={requestTransfer}>
          <select className="select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select product...</option>
            {rows.map((r) => (
              <option key={r.item.id} value={r.item.id}>#{r.item.id} · {r.item.name} (owner {shorten(r.item.currentOwner)})</option>
            ))}
          </select>
          <span className="muted">→ new owner</span>
          <ActorSelect value={receiver} onChange={setReceiver} />
          <button className="btn primary" type="submit" disabled={busy || !itemId}>Request transfer</button>
        </form>
      </section>

      {loading && !data && <Spinner />}
      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="grid">
        {rows.map((r) => {
          const t = r.transfer
          const pending = t && t.pending
          const receiverIdx = t ? actorFor(t.to) : undefined
          return (
            <article className="card" key={r.item.id}>
              <div className="card-body">
                <div className="row-between">
                  <h4>#{r.item.id} · {r.item.name}</h4>
                  <Badge color={STATE_COLORS[r.item.state]}>{STATES[r.item.state]}</Badge>
                </div>
                <p className="meta">Current owner: {shorten(r.item.currentOwner)}</p>
                {pending ? (
                  <>
                    <div className="alert-box warn">🔁 Pending transfer to {shorten(t.to)} · requested {fmtTime(t.requestedAt)}</div>
                    <div className="actions">
                      <button
                        className="btn small primary"
                        disabled={busy || receiverIdx === undefined}
                        onClick={() => run('Ownership transferred', () => api.confirmTransfer(r.item.id, { actorIndex: receiverIdx }))}
                      >
                        Confirm (as receiver)
                      </button>
                      <button
                        className="btn small ghost"
                        disabled={busy || actorFor(r.item.currentOwner) === undefined}
                        onClick={() => run('Transfer cancelled', () => api.cancelTransfer(r.item.id, { actorIndex: actorFor(r.item.currentOwner) }))}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : t && t.completed ? (
                  <div className="alert-box ok">✅ Last transfer completed {fmtTime(t.completedAt)}</div>
                ) : (
                  <p className="muted">No pending transfer.</p>
                )}
              </div>
            </article>
          )
        })}
        {rows.length === 0 && !loading && <Empty>No products registered yet.</Empty>}
      </div>
    </div>
  )
}
