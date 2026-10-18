import { SevBadge } from '../../../components/terminal/index.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';

const OPEN_MARK = '▾';
const FOLDED_MARK = '▸';

/** How many files a requirement's findings are in. */
export const filesLabel = (count) => t(pluralKey(count, 'violations.scopeReqFile', 'violations.scopeReqFiles'), { count });

/** A requirement's violations by severity, worst first. */
export function ReqSevBadges({ sev }) {
  return (
    <span className="req-group__sev">
      {SEVERITY_ORDER.filter((s) => sev[s]).map((s) => <SevBadge key={s} level={s} count={sev[s]} format="count-abbr" />)}
    </span>
  );
}

/**
 * One requirement's header in the grouped list (list and cards): its id,
 * what it asks, its violations by severity and its files. A click folds or
 * opens its findings (`onToggle(req)`); in the list it stays pinned at the
 * top while its findings scroll under it.
 */
export default function ReqGroupHeader({ row, onToggle }) {
  const passing = !Object.keys(row.sev).length;
  return (
    <button type="button" className={`req-group${passing ? ' req-group--pass' : ''}`} aria-expanded={row.open} onClick={() => onToggle(row.req)}>
      <span className="req-group__tw" aria-hidden="true">{row.open ? OPEN_MARK : FOLDED_MARK}</span>
      <span className="req-group__id">{row.req || t('violations.scopeReqNone')}</span>
      {row.req && row.text !== row.req && <span className="req-group__text">{row.text}</span>}
      {passing ? <span className="req-group__n">{row.count}</span> : <ReqSevBadges sev={row.sev} />}
      <span className="req-group__files">{filesLabel(row.fileCount)}</span>
    </button>
  );
}
