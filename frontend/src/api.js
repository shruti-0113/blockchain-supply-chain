const BASE =
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:5000')

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

const get = (p) => req(p)
const post = (p, body) => req(p, { method: 'POST', body })

export const api = {
  base: BASE,
  health: () => get('/health'),
  overview: () => get('/overview'),
  actors: () => get('/actors'),
  items: () => get('/items'),
  item: (id) => get(`/items/${id}`),
  createItem: (body) => post('/items', body),
  setState: (id, body) => post(`/items/${id}/state`, body),

  passport: (id) => get(`/items/${id}/passport`),
  checkpoints: (id) => get(`/items/${id}/checkpoints`),
  verify: (id) => get(`/items/${id}/verify`),
  tamper: (id, body) => post(`/items/${id}/tamper`, body),
  untamper: (id, body) => post(`/items/${id}/untamper`, body),

  temperature: (id) => get(`/items/${id}/temperature`),
  addTemperature: (id, body) => post(`/items/${id}/temperature`, body),

  leg: (id, body) => post(`/items/${id}/leg`, body),
  carbon: (id) => get(`/items/${id}/carbon`),
  carbonAll: () => get('/carbon'),

  scan: (id, body) => post(`/items/${id}/scan`, body),
  authenticity: (id) => get(`/items/${id}/authenticity`),
  authenticityAll: () => get('/authenticity'),

  transfer: (id) => get(`/items/${id}/transfer`),
  requestTransfer: (id, body) => post(`/items/${id}/transfer/request`, body),
  confirmTransfer: (id, body) => post(`/items/${id}/transfer/confirm`, body),
  cancelTransfer: (id, body) => post(`/items/${id}/transfer/cancel`, body),

  prediction: (id) => get(`/items/${id}/prediction`),
  predictions: () => get('/predictions'),

  reputation: () => get('/reputation'),
  dispute: (body) => post('/dispute', body),
  assignRole: (body) => post('/roles/assign', body)
}
