export const STATES = ['Manufactured', 'Shipped', 'Received', 'Distributed', 'Delivered']
export const STATE_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981']

export const EVENT_META = {
  Created: { icon: '🏭', color: '#94a3b8', label: 'Manufactured' },
  Shipped: { icon: '🚚', color: '#3b82f6', label: 'Shipped' },
  Received: { icon: '📦', color: '#f59e0b', label: 'Received' },
  Distributed: { icon: '🏬', color: '#8b5cf6', label: 'Distributed' },
  Delivered: { icon: '✅', color: '#10b981', label: 'Delivered' },
  Temperature: { icon: '🌡️', color: '#06b6d4', label: 'Temperature' },
  TransferRequested: { icon: '🔁', color: '#eab308', label: 'Transfer requested' },
  TransferConfirmed: { icon: '🤝', color: '#22c55e', label: 'Transfer confirmed' },
  Scan: { icon: '📷', color: '#ec4899', label: 'Scan' },
  Leg: { icon: '🧭', color: '#0ea5e9', label: 'Transport leg' },
  Note: { icon: '📝', color: '#64748b', label: 'Note' }
}

export const PRESET_IMAGES = [
  { label: 'Electronics', url: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&q=80' },
  { label: 'Pharmaceuticals', url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&q=80' },
  { label: 'Dairy / Frozen', url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&q=80' },
  { label: 'Food', url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80' },
  { label: 'Apparel', url: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&q=80' },
  { label: 'Automotive', url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80' },
  { label: 'Machinery', url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&q=80' }
]

export const FALLBACK_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#1e293b"/><text x="50%" y="50%" fill="#64748b" font-family="sans-serif" font-size="28" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>`
  )

export const shorten = (addr) => (addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '')

export function fmtTime(unix) {
  if (!unix) return '-'
  return new Date(unix * 1000).toLocaleString()
}

export function fmtAgo(unix) {
  if (!unix) return '-'
  const diff = Math.floor(Date.now() / 1000) - unix
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export const riskColor = (level) =>
  level === 'High' ? '#ef4444' : level === 'Medium' ? '#f59e0b' : '#10b981'

export const tempColor = (status) =>
  status === 'ALERT' ? '#ef4444' : status === 'OK' ? '#10b981' : '#64748b'
