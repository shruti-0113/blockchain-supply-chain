import { useApp } from '../context.jsx'

export function ActorSelect({ value, onChange, filterRole, includeAll }) {
  const { actors } = useApp()
  let list = filterRole !== undefined ? actors.filter((a) => a.role === filterRole) : actors
  if (includeAll && filterRole === undefined) list = actors
  return (
    <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {list.map((a) => (
        <option key={a.index} value={a.index}>
          {a.label} ({a.roleName})
        </option>
      ))}
    </select>
  )
}

export function Spinner({ label = 'Loading...' }) {
  return <div className="spinner">{label}</div>
}

export function Empty({ children = 'Nothing to show yet.' }) {
  return <p className="empty">{children}</p>
}

export function ErrorBox({ children }) {
  if (!children) return null
  return <div className="error-box">⚠️ {children}</div>
}

export function Badge({ color, children }) {
  return (
    <span className="badge-inline" style={{ background: color }}>
      {children}
    </span>
  )
}

export function Stat({ value, label, color }) {
  return (
    <div className="stat">
      <span className="stat-num" style={color ? { color } : undefined}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

export function Bar({ value, max = 100, color = '#6366f1' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="bar">
      <span style={{ width: pct + '%', background: color }} />
    </div>
  )
}
