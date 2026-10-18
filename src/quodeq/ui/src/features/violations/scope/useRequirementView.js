import { useMemo, useState } from 'react';
import { dismissKey } from '../../explorer/components/useFileDetailFiltering.js';
import { ROW_KIND } from '../../explorer/components/findingListRows.js';
import { requirementRail, requirementCounts, rowsOfRequirement, reqKindCounts, requirementGroups, groupedRows } from './requirementRail.js';

const findingCount = (rows) => rows.filter((item) => item.v || item.c).length;
const isToggle = (item) => item.kind === ROW_KIND.LOW_CONF_TOGGLE;

/**
 * Which groups are open: the user's (`opened`), else the one requirement
 * picked, else the worst one (the first group), the rest folded.
 */
function useFolds(groups, req) {
  const [opened, setOpened] = useState(null);
  const open = useMemo(() => opened ?? new Set(req ? [req] : groups.slice(0, 1).map((g) => g.req)), [opened, req, groups]);
  const toggle = (r) => {
    const next = new Set(open);
    if (next.has(r)) next.delete(r); else next.add(r);
    setOpened(next);
  };
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.req));
  const setAll = (on) => setOpened(new Set(on ? groups.map((g) => g.req) : []));
  return { open, toggle, allOpen, setAll, reset: () => setOpened(null) };
}

/**
 * A principle's requirements (none for other scopes): the rail of them,
 * the one picked as a filter (`req`, null for all), the kind filter's
 * counts inside it, and the list's rows: `sorted` narrowed to `req`, and
 * when `grouped`, under a header per requirement, folded but for the worst
 * (or the one picked). `total` counts the list's findings for every
 * requirement, `note` the narrowed list against it.
 */
export function useRequirementView({ file, within, filtering, sorted, grouped }) {
  const [req, setReq] = useState(null);
  const { dismissedSet, liveSevCounts, totalCompliance } = filtering;
  const isLive = useMemo(() => (v) => !dismissedSet.has(dismissKey(v)), [dismissedSet]);
  const rail = useMemo(() => (within.inPrinciple ? requirementRail(within.dimension, file, isLive) : null), [file, within, isLive]);
  const counts = useMemo(() => (within.inPrinciple ? requirementCounts(file) : null), [file, within]);
  const kindCounts = useMemo(() => (req ? reqKindCounts(file, req, isLive) : { sev: liveSevCounts, compliance: totalCompliance }),
    [req, file, isLive, liveSevCounts, totalCompliance]);
  const narrowed = useMemo(() => rowsOfRequirement(sorted, req), [sorted, req]);
  const groups = useMemo(() => (grouped && rail ? requirementGroups(narrowed, rail) : []), [grouped, rail, narrowed]);
  const folds = useFolds(groups, req);
  const rows = useMemo(() => (grouped && rail ? [...groupedRows(groups, (r) => folds.open.has(r)), ...narrowed.filter(isToggle)] : narrowed),
    [grouped, rail, groups, folds.open, narrowed]);
  const pick = (r) => { setReq(r); folds.reset(); };
  const total = findingCount(sorted);
  const note = req ? { req, shown: findingCount(narrowed), total, reqCount: rail.failing.length + rail.passing.length } : null;
  return { req, pick, rail, counts, kindCounts, rows, total, folds: grouped && rail ? folds : null, note };
}
