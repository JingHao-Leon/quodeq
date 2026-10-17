import { useEffect, useRef } from 'react';
import { projectKeys, projectsKeys } from '../api/queryKeys.js';
import { invalidateProjects } from './invalidateProjects.js';
import { isFirstRunProject } from '../models/project.js';
import { findProject } from '../utils/projectIdentity.js';
import { JOB_SOURCE, JOB_STATUS } from '../vocab/jobStatus.js';
import { PROJECT_SOURCE } from '../vocab/projectSource.js';
import { NAV_TAB } from '../vocab/navTab.js';

// The never-evaluated projects in the cached projects list.
function firstRunProjects(queryClient) {
  const list = queryClient.getQueryData(projectsKeys.list());
  return Array.isArray(list) ? list.filter(isFirstRunProject) : [];
}

// Whether the finished job was its project's first run: the project had no
// runs when the job started, or the cached entry still says so, or its only
// run is this one (the list can refetch mid-run and already count it, e.g.
// a project added just before the start, absent from the start snapshot).
function wasFirstRun(job, startSnapshot, queryClient) {
  if (findProject(startSnapshot, job.outputProject)) return true;
  const entry = findProject(queryClient.getQueryData(projectsKeys.list()), job.outputProject);
  if (!entry) return false;
  return isFirstRunProject(entry) || (entry.runsCount === 1 && entry.latestRunId === job.outputRunId);
}

// The caches a finished run makes stale: the project list, the run's
// scores and its Compare summary.
function invalidateRunCaches(queryClient, project) {
  invalidateProjects(queryClient)
    .catch((err) => console.error('Failed to refresh projects:', err));
  // useAppState's dashboard-key effect (removed as redundant: the
  // selectProjectAndRun call below mints a new dashboard query key on its
  // own) only ever covered the dashboard side. The scores side has its
  // own key -- projectKeys.scores(project, null, source), the `latest`
  // query in useProjectScores -- and it does NOT change when selectedRun
  // flips, because `asOf` only resolves to the new run once
  // `availableRuns` (itself sourced from this same query) already lists
  // it. Left un-invalidated, a user parked on the Overview when a run
  // completes never gets the refreshed `availableRuns`/`accumulated`:
  // repeat-run projects show stale grades until a tab round-trip, and a
  // first-run project never gets `accumulated`, so `contentReady` stays
  // false and the page sits on the inline loader indefinitely. Evaluations
  // only ever write to the
  // local repo, so the 'local' source (the default) is always correct
  // here regardless of which source tab the user has open elsewhere.
  // Unconditional on outputProject: invalidating an inactive observer's
  // query just marks it stale (no fetch), so this is a harmless no-op
  // when nobody is looking at that project.
  queryClient.invalidateQueries({ queryKey: projectKeys.scores(project, null, PROJECT_SOURCE.LOCAL) });
  // The Compare tab holds one slim summary per project; without this a
  // finished run on ANY project leaves its fleet row stale until the
  // staleTime expires or the tab remounts. Same harmless-no-op rule as
  // above when Compare isn't mounted.
  queryClient.invalidateQueries({ queryKey: projectKeys.compareSummary(project, PROJECT_SOURCE.LOCAL) });
}

// Only move the selection to the finished run when the user is
// already on that project (or has none selected, e.g. first-eval
// onboarding). Unconditional switching yanked a user browsing
// project B into project A the moment A's background run finished,
// without any nav reset. The evaluate card's "view results" button
// remains the explicit way to jump to another project's results.
// An external run never fills an empty selection either: a PR
// review's project is a throwaway, and a nightly finishing at night
// must not change what the user was looking at.
function ownsSelection(job, external, selectedProject) {
  return external ? job.outputProject === selectedProject : (!selectedProject || job.outputProject === selectedProject);
}

// A first run that finished cleanly, watched on Evaluate, opens the
// Overview where its grades land. Failed runs stay on Evaluate (their
// error is there); external runs never navigate.
function opensOverview({ job, external, firstRun, activeTab }) {
  return !external && firstRun && job.status === JOB_STATUS.DONE && activeTab === NAV_TAB.EVALUATE;
}

// A running job: on its start, remember which projects had no runs yet;
// on first sight of one the app started, open Evaluate.
function noteRunning({ prevJob, external, queryClient, navTab, startSnapshotRef }) {
  if (prevJob?.status !== JOB_STATUS.RUNNING) startSnapshotRef.current = firstRunProjects(queryClient);
  if (!prevJob && !external) navTab(NAV_TAB.EVALUATE);
}

/**
 * The evaluation job-completion effect: on-start nav, then, once per
 * finished run, the project-list refetch, the scores/compare-summary cache
 * invalidation, and the selection move to the new run. A project's first
 * run that finishes cleanly while the user watches it on Evaluate then
 * opens its Overview, where the first grades land; later runs stay put.
 */
export function useJobCompletionEffect({ job, navTab, activeTab, queryClient, selectedProject, selectProjectAndRun }) {
  const prevJobRef = useRef(null);
  const refreshedRunRef = useRef(null);
  const startSnapshotRef = useRef(null);
  useEffect(() => {
    // A run the app did not start (CI, terminal) is adopted in the
    // background: it never moves the user to another tab.
    const external = job?.source === JOB_SOURCE.EXTERNAL;
    const running = job?.status === JOB_STATUS.RUNNING;
    if (running) noteRunning({ prevJob: prevJobRef.current, external, queryClient, navTab, startSnapshotRef });
    // Auto-refresh dashboard data as soon as the run completes
    const finished = job && !running && job.outputProject && job.outputRunId;
    if (finished && refreshedRunRef.current !== job.outputRunId) {
      refreshedRunRef.current = job.outputRunId;
      // Read before the list invalidation refetches it.
      const firstRun = wasFirstRun(job, startSnapshotRef.current, queryClient);
      invalidateRunCaches(queryClient, job.outputProject);
      if (ownsSelection(job, external, selectedProject)) {
        selectProjectAndRun(job.outputProject, job.outputRunId);
        if (opensOverview({ job, external, firstRun, activeTab })) navTab(NAV_TAB.OVERVIEW);
      }
    }
    prevJobRef.current = job;
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps
}
