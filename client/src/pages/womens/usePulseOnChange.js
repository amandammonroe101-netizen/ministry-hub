import { useEffect, useRef, useState } from 'react';

/* Returns true for a brief window whenever `value` changes — drives the
   "bloom" pulse animation on stat numbers when their count updates. */
export default function usePulseOnChange(value) {
  const [pulsing, setPulsing] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 600);
    return () => clearTimeout(t);
  }, [value]);

  return pulsing;
}
