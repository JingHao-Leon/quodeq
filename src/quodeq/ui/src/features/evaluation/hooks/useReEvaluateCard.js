/**
 * useReEvaluateCard — composes useReEvalInfo + useDimensionSelection plus
 * the scan-scope/estimate/budget state ReEvaluateCard needs.
 *
 * Split out of ReEvaluateCard.jsx verbatim.
 */
import { useState, useEffect } from 'react';
import { useApi } from '../../../api/ApiContext.jsx';
import { usePluginDimensions } from './usePluginDimensions.js';
import { useScanData } from './useScanData.js';
import { useScanEstimates } from './useScanEstimates.js';
import { useSidePane } from '../../side-pane/SidePaneContext.jsx';
import { ACTIVE_PROVIDER_KEY } from '../../../constants.js';
import { resolveProviderSettings } from '../../../utils/effectiveProviderSettings.js';
import { useReEvalInfo } from './useReEvalInfo.js';
import { useDimensionSelection } from './useDimensionSelection.js';
import { PROJECT_LOCATION, isFirstRunProject, isPathMissing } from '../../../models/project.js';

// The chips pre-select from the same resolution the start payload and the
// Settings screen use, so the form can never claim a budget the run
// wouldn't get if the user changed nothing.
function initialBudgetSeconds(storage = localStorage) {
  const provider = storage.getItem(ACTIVE_PROVIDER_KEY) || '';
  if (!provider) return 0;
  return resolveProviderSettings(provider, storage).timeLimitS;
}

// Whether the project was never evaluated, read once from the first
// projects-list entry the card sees: null until one arrives, then fixed for
// the mount, so a refetch that counts the run never flips the defaults.
function useFirstRunLatch(projectInfo) {
  const [latched, setLatched] = useState(() => (projectInfo ? isFirstRunProject(projectInfo) : null));
  useEffect(() => {
    if (latched === null && projectInfo) setLatched(isFirstRunProject(projectInfo));
  }, [latched, projectInfo]);
  return latched;
}

// Scan scope the user picks on the card (branch, sub-path, time budget),
// and whether this is a first run (latched); branch and path reset when the
// project changes. A first run starts with
// no time limit whatever the provider's Settings say, applied once when the
// latch settles (even when the entry arrives after mount); the chips still
// let the user pick one.
function useReEvalScope(project, projectInfo) {
  const firstRun = useFirstRunLatch(projectInfo) === true;
  const [branch, setBranch] = useState(null);
  const [scopePath, setScopePath] = useState(null);
  const [timeLimitS, setTimeLimitS] = useState(() => (firstRun ? 0 : initialBudgetSeconds()));

  useEffect(() => { setScopePath(null); setBranch(null); }, [project]);
  useEffect(() => { if (firstRun) setTimeLimitS(0); }, [firstRun]);

  return { branch, setBranch, scopePath, setScopePath, timeLimitS, setTimeLimitS, isFirstRun: firstRun };
}

// Local-project-only data: the scan preview and the pre-run estimates. A
// folder that is not on this machine has nothing to scan yet.
function useReEvalScan(project, info) {
  const isLocal = info?.location === PROJECT_LOCATION.LOCAL;
  const scannable = isLocal && !isPathMissing(info);
  const { scanData } = useScanData(scannable ? project : null);
  const { estimates, loading: estimatesLoading } = useScanEstimates(project, scannable && !info?.pathMissing);
  return { isLocal, scanData, estimates, estimatesLoading };
}

/**
 * Everything the re-evaluate card renders and does: project info (with the
 * restore-from-URL recovery), the dimension picker, branch/scope/time-limit
 * scope state, and the scan estimates.
 *
 * Composes useReEvalInfo, usePluginDimensions and useDimensionSelection so the
 * card itself stays presentational.
 */
export function useReEvaluateCard(project, onStart, projectInfo, preselectDims) {
  const api = useApi();
  const { getProjectInfo, relocateProject } = api;
  const { info, error, retry, relocate, urlInput, setUrlInput, urlError, urlSaving, handleUrlRestore } = useReEvalInfo(project, projectInfo, { getProjectInfo, relocateProject });
  const { allDimensions } = usePluginDimensions();
  const { showToast } = useSidePane();
  const { branch, setBranch, scopePath, setScopePath, timeLimitS, setTimeLimitS, isFirstRun } = useReEvalScope(project, projectInfo);
  const { isLocal, scanData, estimates, estimatesLoading } = useReEvalScan(project, info);

  const { selectedDims, toggleDim, selectAll, clearAll, handleScan, cleanScan, setCleanScan } =
    useDimensionSelection({ allDimensions, info, branch, scopePath, onStart, onValidationFail: showToast, preselectDims, isFirstRun, project, timeLimitS });

  return {
    info, error, retry, relocate, allDimensions, selectedDims,
    toggleDim, selectAll, clearAll, handleScan, cleanScan, setCleanScan,
    urlInput, setUrlInput, urlError, urlSaving, handleUrlRestore,
    isLocal, scanData, estimates, estimatesLoading, branch, setBranch, scopePath, setScopePath,
    timeLimitS, setTimeLimitS, isFirstRun,
  };
}
