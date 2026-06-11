import { useCallback, useState } from 'react'

function readStorage<T>(key: string, initialValue: T): T {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
}

export default function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (val: T) => void, { getStorageSync: () => T }] {
  const [state, setState] = useState<T>(() => readStorage(key, initialValue))

  const set = (val: T) => {
    setState(val)
    try {
      localStorage.setItem(key, JSON.stringify(val))
    } catch {}
  }

  const getStorageSync = useCallback(() => readStorage(key, initialValue), [key, initialValue])

  return [state, set, { getStorageSync }]
}
