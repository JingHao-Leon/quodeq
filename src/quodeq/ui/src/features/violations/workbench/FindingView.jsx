/**
 * A finding in full, as the detail panels beside a list show it: severity
 * and title as the headline, where it is, the caller's actions (`children`),
 * why it was raised, the rule it breaks and its code. The Violations
 * workbench and the principle and file pages render it.
 */
import ContextBlock from '../../../components/ContextBlock.jsx';
import DetailSkeleton from '../../../components/DetailSkeleton.jsx';
import { RefLinks, DowngradeTags } from '../../../components/findingDetail.jsx';
import { SevBadge } from '../../../components/terminal/index.js';
import { t } from '../../../strings/index.js';
import { parentFolder } from './folderModel.js';
import { useRequirementText } from './useRequirementText.js';

/** A filter link; plain text when there is no handler. */
function PathLink({ label, onPick, muted, children }) {
  if (!onPick) return <span className="wb-muted">{children}</span>;
  return (
    <button type="button" className={muted ? 'wb-link wb-link--muted' : 'wb-link'} aria-label={label} title={label} onClick={onPick}>{children}</button>
  );
}

export function Where({ finding, confidence, onAddPath }) {
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

/** `v` is the finding (hydrated when it can be); `where` the place line. */
export default function FindingView({ v, where, children }) {
  return (
    <div className={`wb-detail__body wb-detail__body--${v.severity}`}>
      <div className="wb-headline">
        <SevBadge level={v.severity} format="long" />
        <h2 className="wb-headline__title">{v.title || v.principle}</h2>
      </div>
      {where}
      {children}
      <Why v={v} />
      <Rule v={v} req={v.req} dimension={v.dimension} />
      {!v.detailDeferred && (
        <div className="vlive-detail vlive-detail--terminal wb-code">
          <ContextBlock context={v.context} snippet={v.snippet} scope={v.scope} line={v.line} file={v.file} />
        </div>
      )}
    </div>
  );
}
