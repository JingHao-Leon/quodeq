/** History's per-tab memory (chosen tab, filters): sessionStorage, or null when blocked. */
export function historySession() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch (err) {
    console.warn('[history] sessionStorage blocked:', err);
    return null;
  }
}
