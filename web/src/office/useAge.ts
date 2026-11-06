import { useEffect, useRef } from 'react';

/** Returns age(t): seconds since `id` last changed to a truthy value (Infinity if never / reset). Call age inside useFrame. */
export function useAge(id?: string) {
  const at = useRef<number | null>(null);
  const armed = useRef(false);
  useEffect(() => {
    armed.current = !!id;
    if (!id) at.current = null;
  }, [id]);
  return (t: number) => {
    if (armed.current) {
      at.current = t;
      armed.current = false;
    }
    return at.current == null ? Infinity : t - at.current;
  };
}
