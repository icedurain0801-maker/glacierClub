import { useState, useRef, useCallback } from 'react'

export default function useSyncState<T>(initialValue: T): [T, (val: T) => void, () => T] {
  const [state, setState] = useState<T>(initialValue)
  const ref = useRef<T>(initialValue)

  const set = useCallback((val: T) => {
    ref.current = val
    setState(val)
  }, [])

  const get = useCallback(() => ref.current, [])

  return [state, set, get]
}
