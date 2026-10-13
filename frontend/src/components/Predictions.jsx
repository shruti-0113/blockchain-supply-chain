import { api } from '../api.js'
import { useApp } from '../context.jsx'
import { useAsync } from '../hooks.js'
import { ErrorBox, Empty, Spinner, Badge, Bar } from './common.jsx'
import { STATES, STATE_COLORS, riskColor, shorten } from '../utils.js'

export default function Predictions() {
  const { refreshSignal, goToPassport } = useApp()
  const [{ loading, data, error }] = useAsync(() => api.predictions(), [refreshSignal])

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox>{error}</ErrorBox>
  if (!data) return <Empty />

  const rows = data.predictions
  const highRisk = rows.filter((r) => r.prediction.level === 'High')

  return (
    <div>
      <section className="card-panel">
        <h3>AI-Powered Delay Prediction</h3>
        <p className="muted">A baseline model scores each shipment from trusted on-chain history (stale checkpoints, temperature alerts, route length, handoffs) and suggests corrective actions.</p>
        <div className="stat-row">
          <div className="stat"><span className="stat-num">{rows.length}</span><span className="stat-label">Shipments scored</span></div>
          <div className="stat"><span className="stat-num" style={{ color: '#ef4444' }}>{highRisk.length}</span><span className="stat-label">High risk</span></div>
        </div>
      </section>

      <div className="list">
        {rows.map(({ item, prediction }) => (
          <article className={'risk-row' + (prediction.level === 'High' ? ' high' : '')} key={item.id}>
            <div className="risk-head">
              <div>
                <h4 onClick={() => goToPassport(item.id)}>#{item.id} · {item.name}</h4>
                <p className="meta">
                  <Badge color={STATE_COLORS[item.state]}>{STATES[item.state]}</Badge>{' '}
                  owner {shorten(item.currentOwner)}
                </p>
              </div>
              <div className="risk-score" style={{ color: riskColor(prediction.level) }}>
                {prediction.riskScore}%<small>{prediction.level} risk</small>
              </div>
            </div>

            <Bar value={prediction.riskScore} max={100} color={riskColor(prediction.level)} />

            <div className="risk-cols">
              <div>
                <h5>Risk factors</h5>
                {prediction.reasons.length ? (
                  <ul className="tag-list">
                    {prediction.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                ) : <p className="muted">No significant risk factors.</p>}
              </div>
              <div>
                <h5>Recommended action</h5>
                <ul className="suggest-list">
                  {prediction.suggestions.map((s, i) => <li key={i}>💡 {s}</li>)}
                </ul>
              </div>
              <div className="risk-facts">
                <p>Age: <strong>{prediction.ageHours}h</strong></p>
                <p>Since update: <strong>{prediction.staleHours}h</strong></p>
                {prediction.historicalAvgTransitHours != null && <p>Hist. avg transit: <strong>{prediction.historicalAvgTransitHours}h</strong></p>}
                {prediction.estimatedHoursRemaining != null && <p>Est. remaining: <strong>{prediction.estimatedHoursRemaining}h</strong></p>}
              </div>
            </div>
          </article>
        ))}
        {rows.length === 0 && <Empty>No products to score yet.</Empty>}
      </div>
    </div>
  )
}
