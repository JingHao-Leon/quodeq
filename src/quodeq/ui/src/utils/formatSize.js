import { t } from '../strings/index.js';

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
const BYTES_PER_GB = BYTES_PER_MB * BYTES_PER_KB;
const MB_DECIMALS = 1;
const GB_DECIMALS = 1;

/**
 * A byte count as display text: one decimal in MB from 1 MB up ("12.0 MB"),
 * whole KB below it ("2 KB", never "0 KB" for a non-empty count).
 * @param {number|null|undefined} bytes
 * @returns {string|null} null when there is no count to show yet (0 included)
 */
export function formatSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes >= BYTES_PER_MB) return t('common.sizeMb', { size: (bytes / BYTES_PER_MB).toFixed(MB_DECIMALS) });
  return t('common.sizeKb', { size: Math.max(1, Math.round(bytes / BYTES_PER_KB)) });
}

/**
 * A byte count for totals that can run to gigabytes (Settings › Storage,
 * Repositories): one decimal in GB from 1 GB up ("6.5 GB"), formatSize below
 * it, and "0 KB" for nothing instead of no text.
 * @param {number|null|undefined} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (typeof bytes === 'number' && bytes >= BYTES_PER_GB) {
    return t('common.sizeGb', { size: (bytes / BYTES_PER_GB).toFixed(GB_DECIMALS) });
  }
  return formatSize(bytes) ?? t('common.sizeKb', { size: 0 });
}
