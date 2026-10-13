import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const mounted = useRef(false)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    try {
      const data = await fn()
      if (mounted.current) setState({ loading: false, data, error: null })
      return data
    } catch (e) {
      if (mounted.current) setState({ loading: false, data: null, error: e.message })
      return null
    }
  }, deps)

  useEffect(() => {
    mounted.current = true
    load()
    return () => { mounted.current = false }
  }, [load])

  return [state, load]
}
