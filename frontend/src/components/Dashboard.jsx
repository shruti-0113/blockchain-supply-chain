import { api } from '../api.js'
import { useApp } from '../context.jsx'
import { useAsync } from '../hooks.js'
import { ErrorBox, Empty, Stat, Bar, Spinner } from './common.jsx'
import { EVENT_META, STATES, STATE_COLORS, fmtAgo, shorten } from '../utils.js'

export default function Dashboard() {
  const { refreshSignal, goToPassport } = useApp()
  const [{ loading, data, error }] = useAsync(() => api.overview(), [refreshSignal])

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox>{error}</ErrorBox>
  if (!data) return <Empty />

  const maxState = Math.max(1, ...data.byState)

  return (
    <div>
      <section className="hero">
        <h2>Track every product, from factory to doorstep</h2>
        <p>Immutable, transparent records secured on the blockchain.</p>
      </section>

      <div className="stat-row">
        <Stat value={data.itemCount} label="Products" color="#6366f1" />
        <Stat value={data.totalCheckpoints} label="On-chain checkpoints" color="#0ea5e9" />
        <Stat value={data.alerts} label="Temperature alerts" color="#ef4444" />
        <Stat value={data.highRisk} label="High-risk shipments" color="#f59e0b" />
        <Stat value={data.suspicious} label="Suspicious scans" color="#ec4899" />
      </div>

      <div className="two-col">
        <section className="card-panel">
          <h3>Pipeline</h3>
          {STATES.map((s, i) => (
            <div className="bar-row" key={s}>
              <span className="bar-label">{s}</span>
              <Bar value={data.byState[i]} max={maxState} color={STATE_COLORS[i]} />
              <span className="bar-value">{data.byState[i]}</span>
            </div>
          ))}
        </section>

        <section className="card-panel">
          <h3>Recent on-chain activity</h3>
          {data.recentActivity.length === 0 && <Empty>No activity yet.</Empty>}
          <ul className="activity">
            {data.recentActivity.map((a, i) => {
              const meta = EVENT_META[a.type] || { icon: '•', color: '#64748b' }
              return (
                <li key={i} className="activity-item" onClick={() => goToPassport(a.id)}>
                  <span className="activity-icon" style={{ background: meta.color + '22', color: meta.color }}>
                    {meta.icon}
                  </span>
                  <div className="activity-body">
                    <p>
                      <strong>#{a.id} {a.name}</strong> · {a.type}
                    </p>
                    <small>
                      {a.data ? a.data + ' · ' : ''}
                      {shorten(a.actor)} · {fmtAgo(a.timestamp)}
                    </small>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
