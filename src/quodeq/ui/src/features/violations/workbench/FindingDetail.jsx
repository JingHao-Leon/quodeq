import { useMemo } from 'react';
import { SectionLabel, SevBadge } from '../../../components/terminal/index.js';
import ContextBlock from '../../../components/ContextBlock.jsx';
import DetailSkeleton from '../../../components/DetailSkeleton.jsx';
import { RefLinks, DowngradeTags } from '../../../components/findingDetail.jsx';
import { VerifiedChip } from '../components/VerifiedChip.jsx';
import { t } from '../../../strings/index.js';
import DismissMenu from './DismissMenu.jsx';
import FixPlanButton from './FixPlanButton.jsx';
import { FINDING_STATUS } from '../violationsVocab.js';
import { parentFolder } from './folderModel.js';
import { useFindingDetail } from './useFindingDetail.js';
import { useRequirementText } from './useRequirementText.js';

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

/** A filter link; plain text when there is no handler. */
function PathLink({ label, onPick, muted, children }) {
  if (!onPick) return <span className="wb-muted">{children}</span>;
  return (
    <button type="button" className={muted ? 'wb-link wb-link--muted' : 'wb-link'} aria-label={label} title={label} onClick={onPick}>{children}</button>
  );
}

function Where({ finding, confidence, onAddPath }) {
  const folder = parentFolder(finding.file);
  return (
    <div className="wb-where">
      {finding.file && (
        <PathLink label={t('violations.wbFilterFileNamed', { path: finding.file })} onPick={onAddPath && (() => onAddPath(finding.file))}>
          {finding.line != null ? t('violations.wbFileLine', { file: finding.file, line: finding.line }) : finding.file}
        </PathLink>
      )}
      {folder && (
        <PathLink muted label={t('violations.wbFilterFolderNamed', { folder })} onPick={onAddPath && (() => onAddPath(folder))}>
          {t('violations.wbInFolder', { folder })}
        </PathLink>
      )}
      {confidence != null && <span className="wb-muted">{t('violations.wbConfidence', { value: confidence })}</span>}
    </div>
  );
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

function Why({ v }) {
  if (v.detailDeferred) return <DetailSkeleton />;
  if (!v.reason && !v.detailUnavailable) return null;
  return (
    <div className="wb-sec">
      <span className="vlive-detail-section-label">{t('violations.wbWhy')}</span>
      {v.reason && <p className="vlive-detail-reason">{v.reason}</p>}
      {v.detailUnavailable && <p className="vlive-detail-reason vlive-detail-reason--unavailable">{t('explorer.detailUnavailable')}</p>}
    </div>
  );
}

/** The rule broken: its id, what the standard asks, its references and any gate that lowered the severity. */
function Rule({ v, req, dimension }) {
  const text = useRequirementText(dimension, req);
  if (!req) return null;
  return (
    <div className="wb-sec">
      <div className="vlive-detail-section-header">
        <span className="vlive-detail-section-label">{t('violations.wbRule')}</span>
        <RefLinks reqRefs={v.reqRefs} />
      </div>
      <p className="wb-rule"><span className="wb-rule__id">{req}</span>{text}</p>
      <DowngradeTags v={v} />
    </div>
  );
}

/**
 * The selected finding in full: severity and title as the headline, where it
 * is, one bar of actions, why it was raised, the rule it breaks and its code.
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
  const v = { ...violation, principle: finding.principle, dimension: finding.dimension };
  const dismissed = finding.status !== FINDING_STATUS.OPEN;
  return (
    <section className="qd-cards-panel wb-panel wb-detail">
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('violations.wbFindingHead')}</SectionLabel>
        <span className="run-history-panel__stats">{[finding.dimension, finding.principle].filter(Boolean).join(t('violations.wbDot'))}</span>
      </div>
      <div className={`wb-detail__body wb-detail__body--${finding.severity}`}>
        <div className="wb-headline">
          <SevBadge level={finding.severity} format="long" />
          <h2 className="wb-headline__title">{finding.title || finding.principle}</h2>
        </div>
        <Where finding={finding} confidence={violation?.confidence ?? finding.raw.confidence} onAddPath={onAddPath} />
        <ActionBar finding={finding} v={v} rule={rule} actions={actions} />
        {dismissed && (
          <div className="wb-dismissed">
            {t('violations.wbDismissedNote', { scope: finding.raw.scope ? `${t('violations.wbDot')}${finding.raw.scope}` : '' })}
          </div>
        )}
        <Why v={v} />
        <Rule v={v} req={finding.req} dimension={finding.dimension} />
        {!v.detailDeferred && (
          <div className="vlive-detail vlive-detail--terminal wb-code">
            <ContextBlock context={v.context} snippet={v.snippet} scope={v.scope} line={v.line} file={v.file} />
          </div>
        )}
      </div>
    </section>
  );
}
