import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { storageKeys } from '../../../api/queryKeys.js';
import { invalidateProjects } from '../../../hooks/invalidateProjects.js';

// GET /api/storage walks the disk, so it is never polled; the cheap clean
// snapshot is, once a second, only while a pass runs.
const CLEAN_POLL_MS = 1000;
export const CLEAN_STATE = Object.freeze({ IDLE: 'idle', RUNNING: 'running', DONE: 'done', FAILED: 'failed' });

/**
 * The newer of the two clean snapshots: the poll's or the summary's (a
 * summary refetched after another window started a pass can be the newer).
 */
function newerClean(poll, summary) {
  const fromPoll = poll?.state.data?.clean;
  const fromSummary = summary.data?.clean;
  if (!fromPoll) return fromSummary ?? null;
  if (!fromSummary) return fromPoll;
  return poll.state.dataUpdatedAt >= summary.dataUpdatedAt ? fromPoll : fromSummary;
}

/**
 * The clean snapshot to show. Polls GET /storage/clean while it says running
 * and, when it leaves running, refetches the summary once. `finishedHere` is
 * true once this session saw a pass go from running to done, so a done left
 * over from an earlier pass is never announced as fresh.
 */
function useCleanProgress(summary) {
  const { getCleanStatus } = useApi();
  const queryClient = useQueryClient();
  const isRunning = (query) => newerClean(query, summary)?.state === CLEAN_STATE.RUNNING;
  const poll = useQuery({
    queryKey: storageKeys.clean(), queryFn: getCleanStatus,
    enabled: isRunning, refetchInterval: (query) => (isRunning(query) ? CLEAN_POLL_MS : false),
  });
  const clean = newerClean({ state: { data: poll.data, dataUpdatedAt: poll.dataUpdatedAt } }, summary);
  const running = clean?.state === CLEAN_STATE.RUNNING;
  const wasRunning = useRef(false);
  const [finishedHere, setFinishedHere] = useState(false);
  useEffect(() => {
    if (wasRunning.current && !running) {
      setFinishedHere(clean?.state === CLEAN_STATE.DONE);
      queryClient.invalidateQueries({ queryKey: storageKeys.summary(), exact: true });
    }
    if (running) setFinishedHere(false);
    wasRunning.current = running;
  }, [running, clean?.state, queryClient]);
  return { clean, running, finishedHere: finishedHere && clean?.state === CLEAN_STATE.DONE };
}

function useArchiveAfter() {
  const { putStorageSettings } = useApi();
  const queryClient = useQueryClient();
  const key = storageKeys.summary();
  return useMutation({
    mutationFn: (archiveAfterDays) => putStorageSettings({ archiveAfterDays }),
    onMutate: async (archiveAfterDays) => {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const previous = queryClient.getQueryData(key);
      if (previous) queryClient.setQueryData(key, { ...previous, archiveAfterDays });
      return { previous };
    },
    onError: (err, _days, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      console.warn('[useStorage] could not save archive-after:', err);
    },
  });
}

/**
 * Settings › Storage: the summary (['storage']), clean progress, and the
 * archive-after, clean and delete-all actions. Each action resolves to its
 * result and rejects with the API error, so the modal shows its own failure.
 */
export default function useStorage() {
  const { getStorage, startClean, deleteAllEvaluations } = useApi();
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: storageKeys.summary(), queryFn: getStorage });
  const progress = useCleanProgress(summary);
  const archiveAfter = useArchiveAfter();
  const runClean = async () => {
    const result = await startClean();
    queryClient.setQueryData(storageKeys.clean(), result);
    return result;
  };
  const deleteAll = async () => {
    const result = await deleteAllEvaluations();
    queryClient.invalidateQueries({ queryKey: storageKeys.summary(), exact: true });
    invalidateProjects(queryClient).catch((err) => console.warn('[useStorage] project list refetch failed:', err));
    return result;
  };
  return {
    data: summary.data ?? null, isLoading: summary.isPending, isError: summary.isError,
    ...progress, setArchiveAfter: archiveAfter.mutate, runClean, deleteAll,
  };
}
