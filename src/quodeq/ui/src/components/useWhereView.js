import { useCallback, useState } from 'react';

const KEY_PREFIX = 'quodeq.where.';

function storage() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch (err) {
    console.debug('[useWhereView] sessionStorage unavailable:', err);
    return null;
  }
}

function readView(key, fallback, views) {
  try {
    const stored = storage()?.getItem(key);
    return views.includes(stored) ? stored : fallback;
  } catch (err) {
    console.debug('[useWhereView] read failed:', err);
    return fallback;
  }
}

/**
 * The Where panel's view (areas, folders or files) for one page, remembered
 * for the browser session: coming back to the page shows the view last
 * chosen there. A stored view the page does not offer, or blocked storage,
 * falls back to *fallback*.
 * @param {string} page - the page's name, one remembered view per page
 * @param {string} fallback - the view to start on
 * @param {string[]} views - the views this page offers
 * @returns {[string, (view: string) => void]}
 */
export function useWhereView(page, fallback, views) {
  const key = `${KEY_PREFIX}${page}`;
  const [view, setView] = useState(() => readView(key, fallback, views));
  const choose = useCallback((next) => {
    setView(next);
    try {
      storage()?.setItem(key, next);
    } catch (err) {
      console.debug('[useWhereView] write failed:', err);
    }
  }, [key]);
  return [view, choose];
}
