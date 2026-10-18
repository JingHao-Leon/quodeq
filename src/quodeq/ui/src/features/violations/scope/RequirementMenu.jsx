import { useState } from 'react';
import CaptionLauncher from '../workbench/CaptionLauncher.jsx';
import { ReqSevBadges, filesLabel } from './ReqGroupHeader.jsx';
import { t } from '../../../strings/index.js';

const PASS_MARK = '✓';

/** A requirement whose id or text holds `q` (any case). */
const matches = (q) => (r) => !q || `${r.req} ${r.text}`.toLowerCase().includes(q.toLowerCase());

function Item({ current, onPick, children, muted = false }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={current} onClick={onPick}
      className={`compare-dueltrigger__item req-menu__item${current ? ' wb-menu__current' : ''}${muted ? ' req-menu__item--pass' : ''}`}>
      {children}
    </button>
  );
}

/** The menu's list: All, the failing requirements worst first, then the passing ones. */
function Options({ rail, total, selected, q, pick }) {
  const failing = rail.failing.filter(matches(q));
  const passing = rail.passing.filter(matches(q));
  return (
    <>
      <Item current={!selected} onPick={pick(null)}>
        <span className="req-menu__all">{t('violations.scopeReqAll')}</span><span className="wb-menu__count">{total}</span>
      </Item>
      {failing.map((r) => (
        <Item key={r.req} current={selected === r.req} onPick={pick(r.req)}>
          <span className="req-menu__id">{r.req}</span>
          <span className="req-menu__body"><span className="req-menu__text">{r.text}</span><span className="req-menu__files">{filesLabel(r.fileCount)}</span></span>
          <ReqSevBadges sev={r.sev} />
        </Item>
      ))}
      {passing.length > 0 && <span className="compare-dueltrigger__hint">{t('violations.scopeReqPassing', { count: passing.length })}</span>}
      {passing.map((r) => (
        <Item key={r.req} muted current={selected === r.req} onPick={pick(r.req)}>
          <span className="req-menu__id"><span aria-hidden="true">{PASS_MARK} </span>{r.req}</span>
          <span className="req-menu__body"><span className="req-menu__text">{r.text}</span></span>
          <span className="wb-menu__count">{r.count}</span>
        </Item>
      ))}
    </>
  );
}

/**
 * A principle's requirements as a filter, the Violations page's launcher:
 * `requirement: all ▸`, a menu that finds a requirement by id or words and
 * reads each with what it asks, its severities and files.
 * @param {{rail: {failing: object[], passing: object[]}, total: number, selected: ?string, onSelect: (req: ?string) => void}} props
 */
export default function RequirementMenu({ rail, total, selected, onSelect }) {
  const [q, setQ] = useState('');
  const caption = t('violations.wbMenuButton', { label: t('violations.scopeReqMenu'), value: selected || t('violations.wbAll') });
  return (
    <CaptionLauncher caption={caption}>
      {(close) => (
        <span className="req-menu">
          <input className="req-menu__search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('violations.scopeReqSearch')} aria-label={t('violations.scopeReqSearchAria')} />
          <Options rail={rail} total={total} selected={selected} q={q} pick={(req) => () => { close(); setQ(''); onSelect(req); }} />
        </span>
      )}
    </CaptionLauncher>
  );
}

/**
 * Above a list narrowed to one requirement: which, how many of the
 * findings it shows, and the way back to all of them.
 */
export function ReqFilterNote({ req, shown, total, reqCount, onClear }) {
  return (
    <div className="req-note">
      <span>{t('violations.scopeReqOnly', { req, shown, total })}</span>
      <button type="button" className="wb-link" onClick={onClear}>{t('violations.scopeReqShowAll', { count: reqCount })}</button>
    </div>
  );
}
