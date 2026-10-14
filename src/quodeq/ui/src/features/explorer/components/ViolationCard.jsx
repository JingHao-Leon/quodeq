import { memo } from 'react';
import { FindingDetailBody, DowngradeTags } from '../../../components/findingDetail.jsx';
import { ViolationActions } from './violationActions.jsx';
import { parseFileRef } from '../../../utils/formatters.js';
import { severityLabel } from '../../../strings/labels.js';

function ViolationCardMarkup({ v, filename, display, refText, onDismiss, readOnly }) {
  return (
    <div className={`vdetail-row vdetail-row--${v.severity}`}>
      <div className="vdetail-row-main">
        <span className={`severity-tag ${v.severity}`}>{severityLabel(v.severity)}</span>
        <DowngradeTags v={v} />
        {v.dimension && <span className="vrow-label">[{v.dimension}]</span>}
        {v.principle && <span className="vrow-label">[{v.principle}]</span>}
        {filename && <span className="vlive-detail-file" title={refText}>{display}</span>}
        <ViolationActions v={v} onDismiss={onDismiss} readOnly={readOnly} />
      </div>
      <FindingDetailBody v={v} />
    </div>
  );
}

/** One violation; `readOnly` (a past run) leaves out the fix plan, which acts on today. */
export default memo(function ViolationCard({ v, onDismiss, readOnly = false }) {
  const { filePath, line } = parseFileRef(v.file, v.line);
  const filename = filePath ? filePath.split('/').pop() : null;
  const range = (v.endLine && v.endLine !== line) ? `${line}-${v.endLine}` : line;
  const refText = line != null ? `${filePath}:${range}` : filePath;
  const display = line != null ? `${filename}:${range}` : filename;
  return <ViolationCardMarkup v={v} filename={filename} display={display} refText={refText} onDismiss={onDismiss} readOnly={readOnly} />;
});
