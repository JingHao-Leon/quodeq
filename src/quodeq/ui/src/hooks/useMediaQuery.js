import { useEffect, useState } from 'react';

const matches = (query) => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches);

/**
 * Whether a CSS media query matches now, kept current as the window changes.
 * Always false where matchMedia is missing.
 * @param {string} query
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const [hit, setHit] = useState(() => matches(query));
  useEffect(() => {
    const list = typeof window !== 'undefined' ? window.matchMedia?.(query) : null;
    if (!list) return undefined;
    const onChange = () => setHit(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return hit;
}
