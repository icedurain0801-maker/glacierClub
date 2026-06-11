import { useEffect, useState, RefObject } from 'react';

export function useTableAdaptHeight(ref: RefObject<HTMLElement>, omit: number = 320): number {
  const [height, setHeight] = useState<number>(400);

  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const h = Math.max(window.innerHeight - rect.top - omit, 200);
      setHeight(h);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [ref, omit]);

  return height;
}
