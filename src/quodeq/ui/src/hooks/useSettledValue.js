import { useEffect, useState } from 'react';

/**
 * `value`, once it has stopped changing for `delayMs`: the first value at
 * once, every later one after a quiet spell. For work too costly to redo on
 * each step of a burst of changes (ticking several filters in a row).
 * Compare values by identity: pass a memoised value.
 * @template T
 * @param {T} value
 * @param {number} delayMs
 * @returns {T}
 */
export function useSettledValue(value, delayMs) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value === settled) return undefined;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, settled, delayMs]);
  return settled;
}
