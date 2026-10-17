import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext.jsx';
import { storageKeys } from '../api/queryKeys.js';

/**
 * The storage summary (['storage'], GET /api/storage): totals and the
 * per-project `{bytes, runs, archived}`. The endpoint walks the disk, so it is
 * read once and refetched after a change, never polled. Settings › Storage
 * and Repositories share this one query.
 */
export function useStorageSummary() {
  const { getStorage } = useApi();
  return useQuery({ queryKey: storageKeys.summary(), queryFn: getStorage });
}
