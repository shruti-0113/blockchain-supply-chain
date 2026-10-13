import { useEffect } from 'react'
import QRCode from 'react-qr-code'
import { api } from '../api.js'
import { useApp } from '../context.jsx'
import { useAsync } from '../hooks.js'
import { Spinner, ErrorBox, Empty, Badge } from './common.jsx'
import { STATES, STATE_COLORS, EVENT_META, FALLBACK_IMG, fmtTime, shorten, tempColor, riskColor } from '../utils.js'

export default function Passport() {
  const { selectedId, setSelectedId, refreshSignal, notify } = useApp()
  const [{ loading, data, error }] = useAsync(
    () => (selectedId ? api.passport(selectedId) : Promise.resolve(null)),
    [selectedId, refreshSignal]
  )
  const [items] = useAsync(() => api.items(), [refreshSignal])

  useEffect(() => {
    if (selectedId && !Number.isNaN(selectedId)) {
      const url = new URL(window.location.href)
      url.searchParams.set('pid', selectedId)
      window.history.replaceState({}, '', url)
    }
  }, [selectedId])

  const list = items.data?.items || []

  const passportLink = data?.item
    ? `${window.location.origin}${window.location.pathname}?pid=${data.item.id}`
    : ''

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(passportLink)
      notify('Passport link copied', 'success')
    } catch (e) {
      notify(passportLink, 'info')
    }
  }

  return (
    <div>
      <section className="card-panel">
        <h3>Open a Product Passport</h3>
        <div className="inline-row">
          <select className="select" value={selectedId || ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
            <option value="">Select a product...</option>
            {list.map((it) => (
              <option key={it.id} value={it.id}>#{it.id} · {it.name}</option>
            ))}
          </select>
          <input
            className="num wide"
            placeholder="or type product ID"
            onKeyDown={(e) => { if (e.key === 'Enter') setSelectedId(Number(e.target.value)) }}
          />
          <span className="muted">Scan a product QR to auto-open its passport.</span>
        </div>
      </section>

      {!selectedId && <Empty>Choose a product to view its blockchain passport.</Empty>}
      {selectedId && loading && <Spinner />}
      {selectedId && error && <ErrorBox>{error}</ErrorBox>}

      {data?.item && (
        <div className="passport">
          <div className="passport-side">
            <img className="passport-img" src={data.item.imageUrl || FALLBACK_IMG} alt={data.item.name} onError={(e) => (e.target.src = FALLBACK_IMG)} />
            <div className="qr-box">
              <QRCode value={passportLink} size={150} bgColor="#ffffff" fgColor="#0b1120" />
            </div>
            <p className="qr-caption">Scan to verify authenticity & history</p>
            <button className="btn small" onClick={copyLink}>Copy passport link</button>

            <div className={data.integrity.valid ? 'integrity ok' : 'integrity bad'}>
              {data.integrity.valid ? '✓ Record chain valid' : '✕ Record chain tampered'}
              <small>{data.integrity.length} checkpoints</small>
            </div>
          </div>

          <div className="passport-main">
            <div className="passport-head">
              <div>
                <h2>#{data.item.id} · {data.item.name}</h2>
                <p className="sku">SKU: {data.item.sku}</p>
                <p className="desc">{data.item.description || 'No description provided.'}</p>
              </div>
              <Badge color={STATE_COLORS[data.item.state]}>{STATES[data.item.state]}</Badge>
            </div>

            <div className="info-grid">
              <div><span>Manufactured at</span><strong>{data.item.origin || '-'}</strong></div>
              <div><span>Manufacturer</span><strong>{shorten(data.item.manufacturer)}</strong></div>
              <div><span>Current holder</span><strong>{shorten(data.item.currentOwner)}</strong></div>
              <div><span>Category</span><strong>{data.item.category}</strong></div>
              {data.item.hasTempRange && (
                <div><span>Temperature limits</span><strong>{data.item.tempMin}°C to {data.item.tempMax}°C</strong></div>
              )}
              <div><span>Registered</span><strong>{fmtTime(data.item.createdAt)}</strong></div>
            </div>

            <div className="summary-row">
              <div className="mini-stat">
                <span style={{ color: tempColor(data.temperature.status) }}>{data.temperature.alertCount}</span>
                Temperature alerts
              </div>
              <div className="mini-stat">
                <span style={{ color: riskColor(data.prediction.level) }}>{data.prediction.riskScore}%</span>
                Delay risk ({data.prediction.level})
              </div>
              <div className="mini-stat">
                <span>{data.carbon.totalKg} kg</span>
                CO₂ footprint
              </div>
              <div className="mini-stat">
                <span style={{ color: data.scans.suspicious ? '#ec4899' : '#10b981' }}>{data.scans.count}</span>
                QR scans
              </div>
            </div>

            {data.scans.suspicious && (
              <div className="alert-box">
                🛡️ Suspicious scan activity: {data.scans.reasons.join(' · ')}
              </div>
            )}
            {data.temperature.alertCount > 0 && (
              <div className="alert-box">
                🌡️ Cold-chain breach detected in {data.temperature.alertCount} checkpoint(s).
              </div>
            )}

            <h3 className="timeline-title">Verified history</h3>
            <ol className="timeline">
              {data.checkpoints.map((cp) => {
                const meta = EVENT_META[cp.type] || { icon: '•', color: '#64748b' }
                return (
                  <li key={cp.index} className="timeline-item">
                    <span className="tl-dot" style={{ background: meta.color }}>{meta.icon}</span>
                    <div className="tl-body">
                      <div className="tl-head">
                        <strong>{meta.label}</strong>
                        <small>{fmtTime(cp.timestamp)}</small>
                      </div>
                      {cp.data && <p className="tl-data">{cp.data}</p>}
                      {cp.hasTemperature && (
                        <p className={cp.tempAlert ? 'tl-temp alert' : 'tl-temp'}>
                          {cp.temperature}°C {cp.tempAlert ? '· OUT OF RANGE' : ''}
                        </p>
                      )}
                      <small className="tl-actor">by {shorten(cp.actor)} · block hash {cp.recordHash.slice(0, 14)}…</small>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
