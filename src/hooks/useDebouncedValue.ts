import { useEffect, useState } from 'react';

/** The value, but only after it has stopped changing for `ms` (drag-rate state → occasional rebuild). */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
