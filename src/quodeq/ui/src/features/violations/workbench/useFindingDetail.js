/**
 * The selected finding with its deferred detail (reason, snippet, context,
 * refs) filled in. The list payload defers those fields; this hydrates only
 * the selected finding's dimension, the way the Finding page does.
 */
import { useMemo } from 'react';
import { useHydratedFindings } from '../../explorer/hooks/useHydratedCompliance.js';
import { FINDING_TYPE } from '../../../vocab/findingType.js';
import { FINDING_STATUS } from '../violationsVocab.js';

const NONE = [];
const loose = (a, b) => (a.file || '') === (b.file || '') && String(a.line ?? null) === String(b.line ?? null) && a.req === b.req;
const exact = (a, b) => loose(a, b) && (a.title || '') === (b.title || '');

/** The n-th hydrated row matching raw under `same`, n being raw's occurrence among the raw items. */
function nthMatch(raw, items, hydrated, same) {
  const n = items.filter((v) => same(v, raw)).indexOf(raw);
  return n < 0 ? undefined : hydrated.filter((v) => same(v, raw))[n];
}

export function useFindingDetail(finding, dims) {
  const open = finding?.status === FINDING_STATUS.OPEN;
  const items = useMemo(() => {
    if (!open) return NONE;
    return (dims || []).find((d) => d.dimension === finding.dimension)?.violations || NONE;
  }, [open, dims, finding?.dimension]);
  const hydrated = useHydratedFindings(items, FINDING_TYPE.VIOLATION);
  if (!finding) return null;
  if (!open) return finding.raw;
  const rows = hydrated || NONE;
  return nthMatch(finding.raw, items, rows, exact) || nthMatch(finding.raw, items, rows, loose) || finding.raw;
}
