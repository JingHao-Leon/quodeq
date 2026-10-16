import { useEffect } from 'react';

// What the open page shows that its nav params do not carry (the area open on
// the Risk tab, the standard open in the editor, a page's tab): each mounted
// page publishes its own key and drops it on unmount, so only what is on
// screen is sent. Read once per message, when it is sent.
const focus = new Map();

function publish(key, value) {
  if (value === null || value === undefined || value === '') focus.delete(key);
  else focus.set(key, value);
}

/**
 * Publish `value` under `key` while the calling component is mounted.
 * @param {string} key
 * @param {string|number|object|null|undefined} value JSON-serialisable
 */
export function usePageFocus(key, value) {
  const serialized = JSON.stringify(value ?? null);
  useEffect(() => {
    publish(key, JSON.parse(serialized));
    return () => focus.delete(key);
  }, [key, serialized]);
}

/**
 * The ui state a message is sent with, plus `focus` when a page published any.
 * @param {object} uiState
 * @returns {object}
 */
export function withPageFocus(uiState) {
  if (focus.size === 0) return uiState;
  return { ...uiState, focus: Object.fromEntries(focus) };
}
