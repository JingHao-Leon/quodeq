import { useMemo } from 'react';
import { SectionLabel } from '../../../components/terminal/index.js';
import { VerifiedChip } from '../components/VerifiedChip.jsx';
import { t } from '../../../strings/index.js';
import DismissMenu from './DismissMenu.jsx';
import FixPlanButton from './FixPlanButton.jsx';
import { FINDING_STATUS } from '../violationsVocab.js';
import FindingView, { Where } from './FindingView.jsx';
import { useFindingDetail } from './useFindingDetail.js';

/** The dismiss-by-rule row useDismissByType expects: every open finding of this rule in this dimension. */
function ruleRow(finding, findings) {
  const same = findings.filter((f) => f.status === FINDING_STATUS.OPEN && f.req === finding.req && f.dimension === finding.dimension);
  return { key: `${finding.dimension}:${finding.req}`, req: finding.req, dimension: finding.dimension, runId: finding.runId, principle: finding.principle,
    violations: same.map((f) => ({ ...f.raw, principle: f.principle })), now: same.length };
}

/**
 * The dismiss-by-rule row of an open finding, when its menu can show: one
 * scan of the list per finding (or list) change, not one per render.
 */
function useRuleRow(finding, findings, canDismissType) {
  const shows = canDismissType && finding?.status === FINDING_STATUS.OPEN && finding.runId != null;
  return useMemo(() => (shows ? ruleRow(finding, findings) : null), [shows, finding, findings]);
}

/** What the finding allows, in one row of pills: fix plan, open file, dismiss (or, once dismissed, restore and delete). */
function ActionBar({ finding, v, rule, actions }) {
  const { onOpenFile, onDismiss, onDismissType, onRestore, onDelete, readOnly = false } = actions;
  const open = finding.status === FINDING_STATUS.OPEN;
  return (
    <div className="wb-actions wb-bar">
      {!readOnly && <FixPlanButton v={v} principle={finding.principle} />}
      {finding.file && onOpenFile && (
        <button type="button" className="eval-pill-btn" onClick={() => onOpenFile(finding)}>{t('violations.wbOpenFile')}</button>
      )}
      {open && onDismiss && <DismissMenu row={rule} onDismissType={onDismissType} onDismiss={() => onDismiss(v, finding.runId)} />}
      {!open && onRestore && <button type="button" className="eval-pill-btn" onClick={() => onRestore(finding.raw)}>{t('violations.restore')}</button>}
      {!open && onDelete && <button type="button" className="eval-pill-btn" onClick={() => onDelete(finding.raw)}>{t('violations.delete')}</button>}
      <VerifiedChip v={v} />
    </div>
  );
}

/**
 * The selected finding in full (FindingView) with the workbench's actions.
 * `actions` holds what the finding allows (onOpenFile, onDismiss,
 * onDismissType, onRestore, onDelete) and `readOnly` (a past day: no fix
 * plan); a missing handler hides its control.
 */
export default function FindingDetail({ finding, dims, findings, onAddPath, actions = {} }) {
  const violation = useFindingDetail(finding, dims);
  const rule = useRuleRow(finding, findings, Boolean(actions.onDismissType));
  if (!finding) {
    return <section className="qd-cards-panel wb-panel wb-detail"><div className="wb-empty">{t('violations.wbPick')}</div></section>;
  }
  const v = { ...violation, severity: finding.severity, title: finding.title, principle: finding.principle, dimension: finding.dimension };
  const dismissed = finding.status !== FINDING_STATUS.OPEN;
  return (
    <section className="qd-cards-panel wb-panel wb-detail">
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('violations.wbFindingHead')}</SectionLabel>
        <span className="run-history-panel__stats">{[finding.dimension, finding.principle].filter(Boolean).join(t('violations.wbDot'))}</span>
      </div>
      <FindingView v={v} where={<Where finding={finding} confidence={violation?.confidence ?? finding.raw.confidence} onAddPath={onAddPath} />}>
        <ActionBar finding={finding} v={v} rule={rule} actions={actions} />
        {dismissed && (
          <div className="wb-dismissed">
            {t('violations.wbDismissedNote', { scope: finding.raw.scope ? `${t('violations.wbDot')}${finding.raw.scope}` : '' })}
          </div>
        )}
      </FindingView>
    </section>
  );
}
