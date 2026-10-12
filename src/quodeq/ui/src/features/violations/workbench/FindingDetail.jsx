import { SectionLabel } from '../../../components/terminal/index.js';
import { t } from '../../../strings/index.js';
import { EvalViolationCard } from '../../explorer/components/EvalCards.jsx';
import DismissRuleMenu from './DismissRuleMenu.jsx';
import { FINDING_STATUS } from '../violationsVocab.js';
import { parentFolder } from './folderModel.js';
import { sevAbbr } from './sevWords.js';
import { useFindingDetail } from './useFindingDetail.js';

/** The dismiss-by-rule row useDismissByType expects: every open finding of this rule in this dimension. */
function ruleRow(finding, findings) {
  const same = findings.filter((f) => f.status === FINDING_STATUS.OPEN && f.req === finding.req && f.dimension === finding.dimension);
  return { key: `${finding.dimension}:${finding.req}`, req: finding.req, dimension: finding.dimension, runId: finding.runId, principle: finding.principle,
    violations: same.map((f) => ({ ...f.raw, principle: f.principle })), now: same.length };
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
      <span className="wb-muted">{finding.req}</span>
      {confidence != null && <span className="wb-muted">{t('violations.wbConfidence', { value: confidence })}</span>}
    </div>
  );
}

function DismissedActions({ finding, onRestore, onDelete }) {
  const scope = finding.raw.scope ? `${t('violations.wbDot')}${finding.raw.scope}` : '';
  return (
    <>
      <div className="wb-dismissed">{t('violations.wbDismissedNote', { scope })}</div>
      <div className="wb-actions">
        {onRestore && <button type="button" className="eval-pill-btn" onClick={() => onRestore(finding.raw)}>{t('violations.restore')}</button>}
        {onDelete && <button type="button" className="eval-pill-btn" onClick={() => onDelete(finding.raw)}>{t('violations.delete')}</button>}
      </div>
    </>
  );
}

export default function FindingDetail({ finding, dims, findings, onAddPath, onOpenFile, onDismiss, onDismissType, onRestore, onDelete }) {
  const violation = useFindingDetail(finding, dims);
  if (!finding) {
    return <section className="qd-cards-panel wb-panel wb-detail"><div className="wb-empty">{t('violations.wbPick')}</div></section>;
  }
  const open = finding.status === FINDING_STATUS.OPEN;
  const sev = sevAbbr(finding.severity) || finding.severity;
  return (
    <section className="qd-cards-panel wb-panel wb-detail">
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('violations.wbFindingLabel', { sev })}</SectionLabel>
        <span className="run-history-panel__stats">{[finding.dimension, finding.principle].filter(Boolean).join(t('violations.wbDot'))}</span>
      </div>
      <div className="wb-detail__body">
        <Where finding={finding} confidence={violation?.confidence ?? finding.raw.confidence} onAddPath={onAddPath} />
        <EvalViolationCard v={{ ...violation, principle: finding.principle, dimension: finding.dimension }} principle={finding.principle} index={0}
          onDismiss={open && onDismiss ? (v) => onDismiss(v, finding.runId) : undefined} />
        {!open && <DismissedActions finding={finding} onRestore={onRestore} onDelete={onDelete} />}
        <div className="wb-actions">
          {open && onDismissType && finding.runId != null && <DismissRuleMenu row={ruleRow(finding, findings)} onDismissType={onDismissType} />}
          {finding.file && onOpenFile && (
            <button type="button" className="eval-pill-btn wb-actions__right" onClick={() => onOpenFile(finding)}>{t('violations.wbOpenFile')}</button>
          )}
        </div>
      </div>
    </section>
  );
}
