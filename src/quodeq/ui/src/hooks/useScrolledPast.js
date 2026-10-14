import { useEffect, useState } from 'react';

/**
 * Whether `ref`'s element has scrolled out of view above the viewport (not
 * below it, where it has yet to be reached). False until it is observed, and
 * always false where IntersectionObserver is missing.
 * @param {{current: ?Element}} ref
 * @returns {boolean}
 */
export function useScrolledPast(ref) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return past;
}
