import { useMemo } from 'react';
import { useProviderDetection } from './useProviderDetection.js';
import { useReviewerChoice } from './useReviewerChoice.js';
import { usePluginDimensions } from '../../evaluation/hooks/usePluginDimensions.js';
import { createScanSummary } from '../../../models/index.js';
import { detectedLanguages } from '../../evaluation/components/scanSummary.js';
import { repoLabel } from '../../dashboard/components/syncStripState.js';

// The last segment of a folder path or a host/owner/repo label.
function lastSegment(value) {
  const parts = String(value || '').split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

/**
 * What the reviewer step's "added" line names, from the wizard state after an
 * add: the project (its folder, or the repository a clone fetches), and for a
 * scanned folder its source-file count and languages. A clone has no scan yet.
 *
 * @param {object} state - the wizard state, with `added` set
 * @returns {{projectId: string|null, cloning: boolean, name: string, fileCount: number|null, languages: string[]}}
 */
export function addedSummary(state) {
  const { projectId, cloning } = state.added;
  const scan = createScanSummary(state.scan);
  const name = cloning ? lastSegment(repoLabel(state.repo.value)) : lastSegment(state.projectPath || state.repo.value);
  return {
    projectId,
    cloning,
    name,
    fileCount: scan?.codeFiles > 0 ? scan.codeFiles : null,
    languages: detectedLanguages(scan?.languages).map((l) => l.name),
  };
}

/**
 * The reviewer step's state: provider detection, the choice being made over
 * the detected providers, and every visible dimension (a first evaluation
 * runs them all). `start` and `later` save the choice first; `later` only
 * when it is complete, so a half pick never overwrites Settings.
 *
 * @param {{ onStart: Function, onLater: Function }} args
 */
export function useReviewerStep({ onStart, onLater }) {
  const { status, results } = useProviderDetection();
  // One array per detection result: the choice's memos key on its identity.
  const detected = useMemo(() => (results || []).filter((r) => r && r.detected), [results]);
  const choice = useReviewerChoice({ detected });
  const { allDimensions } = usePluginDimensions();
  const standardIds = allDimensions.map((d) => d.id);

  return {
    status,
    detected,
    choice,
    dimensionCount: standardIds.length,
    canStart: choice.ready && standardIds.length > 0,
    start: () => {
      choice.save();
      onStart({ provider: { id: choice.providerId, model: choice.model }, standardIds });
    },
    later: () => {
      if (choice.ready) choice.save();
      onLater();
    },
  };
}
