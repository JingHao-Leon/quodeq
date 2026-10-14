import { SectionLabel, SevBadge } from '../../../components/terminal/index.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';

const PASS_MARK = '✓';

function RailItem({ selected, onClick, children, muted = false }) {
  return (
    <li>
      <button type="button" className={`req-rail__item${selected ? ' is-sel' : ''}${muted ? ' req-rail__item--pass' : ''}`}
        aria-pressed={selected} onClick={onClick}>{children}</button>
    </li>
  );
}

/** A failing requirement: its id and severities, what it asks, how many files break it. */
function FailingItem({ row }) {
  return (
    <>
      <span className="req-rail__top">
        <span className="req-rail__id">{row.req}</span>
        <span className="req-rail__sev">
          {SEVERITY_ORDER.filter((s) => row.sev[s]).map((s) => <SevBadge key={s} level={s} count={row.sev[s]} format="count-abbr" />)}
        </span>
      </span>
      <span className="req-rail__text">{row.text}</span>
      <span className="req-rail__files">{t(pluralKey(row.fileCount, 'violations.scopeRailFile', 'violations.scopeRailFiles'), { count: row.fileCount })}</span>
    </>
  );
}

/** A requirement with only compliant checks: its id ticked, how many checks, what it asks. */
function PassingItem({ row }) {
  return (
    <>
      <span className="req-rail__top">
        <span className="req-rail__id"><span aria-hidden="true">{PASS_MARK} </span>{row.req}</span>
        <span className="req-rail__n">{row.count}</span>
      </span>
      <span className="req-rail__text">{row.text}</span>
    </>
  );
}

/**
 * The principle's requirements down the side, as a filter on its findings:
 * All, each failing requirement (worst first), then the passing ones.
 * Picking the selected one again goes back to All.
 * @param {{rail: {failing: object[], passing: object[]}, total: number, selected: ?string, onSelect: (req: ?string) => void}} props
 */
export default function ReqRail({ rail, total, selected, onSelect }) {
  const pick = (req) => () => onSelect(selected === req ? null : req);
  return (
    <nav className="req-rail qd-cards-panel" aria-label={t('violations.scopeRailAria')}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('violations.scopeRailLabel', { count: rail.failing.length + rail.passing.length })}</SectionLabel>
      </div>
      <ul className="req-rail__list">
        <RailItem selected={!selected} onClick={() => onSelect(null)}>
          <span className="req-rail__top"><span className="req-rail__all">{t('violations.scopeRailAll')}</span><span className="req-rail__n">{total}</span></span>
        </RailItem>
        {rail.failing.map((r) => (
          <RailItem key={r.req} selected={selected === r.req} onClick={pick(r.req)}><FailingItem row={r} /></RailItem>
        ))}
        {rail.passing.length > 0 && <li className="req-rail__group">{t('violations.scopeRailPassing', { count: rail.passing.length })}</li>}
        {rail.passing.map((r) => (
          <RailItem key={r.req} muted selected={selected === r.req} onClick={pick(r.req)}><PassingItem row={r} /></RailItem>
        ))}
      </ul>
    </nav>
  );
}
