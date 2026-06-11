import { useMemo, useRef } from 'react';

// 让传入的对象里所有方法以稳定引用暴露：每次调用读取 ref 中最新版本
export function usePersistantFunction<T extends Record<string, (...args: any[]) => any>>(fns: T): T {
  const ref = useRef(fns);
  ref.current = fns;
  return useMemo(() => {
    const out = {} as T;
    Object.keys(fns).forEach((key) => {
      (out as any)[key] = (...args: any[]) => (ref.current as any)[key](...args);
    });
    return out;
  }, []);
}

export function useLatestValueRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
