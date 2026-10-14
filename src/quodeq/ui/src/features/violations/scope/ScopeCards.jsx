import { useState } from 'react';
import ContextBlock from '../../../components/ContextBlock.jsx';
import DetailSkeleton from '../../../components/DetailSkeleton.jsx';
import { RefLinks } from '../../../components/findingDetail.jsx';
import { ViolationActions } from '../../explorer/components/violationActions.jsx';
import { severityLabel, scopeGateRuleLabel } from '../../../strings/labels.js';
import { t } from '../../../strings/index.js';
import { useSplitWidth } from '../hooks/useSplitWidth.js';
import SplitDivider, { splitColumns } from '../components/SplitDivider.jsx';

const SEP = ' · ';
/** The principle beside a finding, left out inside a principle scope (the principle is the page). */
const principleOf = (item, { inPrinciple }) => (inPrinciple ? null : item.principle);

/** Where a finding is: its line inside a file scope (the file is the page), else file:line. */
function whereOf(item, { inFile }) {
  const range = item.endLine && item.endLine !== item.line ? `${item.line}-${item.endLine}` : item.line;
  if (inFile) return range != null ? t('violations.scopeLine', { line: range }) : null;
  const name = (item.file || '').split('/').pop();
  return range != null ? `${name}:${range}` : name;
}

/** A finding's reason and its code, open (the scope reads like a document). */
function Body({ item }) {
  if (item.detailDeferred) return <DetailSkeleton />;
  return (
    <>
      {item.reason && <p className="findings-card__reason">{item.reason}</p>}
      {item.detailUnavailable && <p className="findings-card__reason findings-card__reason--muted">{t('explorer.detailUnavailable')}</p>}
      <ContextBlock context={item.context} snippet={item.snippet} scope={item.scope} line={item.line} file={item.file} />
    </>
  );
}

/** A violation: severity and title as the heading, principle, dimension and line beside it, then reason and code. */
export function FindingCard({ v, within, onDismiss, readOnly }) {
  const meta = [principleOf(v, within), v.dimension, whereOf(v, within)].filter(Boolean).join(SEP);
  return (
    <article className={`findings-card findings-card--${v.severity}`}>
      <header className="findings-card__head">
        <span className={`severity-tag ${v.severity}`}>{severityLabel(v.severity)}</span>
        <h3 className="findings-card__title">{v.title || v.principle}</h3>
        <ViolationActions v={v} onDismiss={onDismiss} readOnly={readOnly} />
      </header>
      <div className="findings-card__meta">
        <span>{meta}</span>
        {v.provenanceDowngrade && <span className="provenance-downgrade-tag" title={t('explorer.provenanceDowngradeTitle')}>{t('explorer.downgradedFromCritical')}</span>}
        {v.scopeDowngrade && <span className="scope-downgrade-tag" title={t('explorer.scopeDowngradeTitle')}>{t('explorer.scopeDowngradeBadge', { rule: scopeGateRuleLabel(v.scopeDowngrade.rule) })}</span>}
        <RefLinks reqRefs={v.reqRefs} />
      </div>
      <Body item={v} />
    </article>
  );
}

/** A compliant check: one quiet line (principle, line, what holds), its reason and code one click away. */
export function CompliantRow({ c, within }) {
  const [open, setOpen] = useState(false);
  const meta = [principleOf(c, within), whereOf(c, within)].filter(Boolean).join(SEP);
  return (
    <article className={`findings-check${open ? ' is-open' : ''}`}>
      <button type="button" className="findings-check__line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="findings-check__mark" aria-hidden="true">✓</span>
        <span className="findings-check__title">{c.title || c.principle}</span>
        <span className="findings-check__meta">{meta}</span>
      </button>
      {open && <div className="findings-check__body"><Body item={c} /></div>}
    </article>
  );
}

const isViolationRow = (item) => Boolean(item.v);
const findingOfRow = (item) => item.v || item.c;
const rowKey = (item, i) => { const f = findingOfRow(item); return `${f.file}:${f.line}:${f.principle}:${i}`; };

/**
 * The scope as a list beside one finding in full: the same rows the cards
 * read (already filtered and sorted by the scope's controls), one line each,
 * and the selected one on the right with its code open.
 */
export function ScopeList({ rows, within, onDismiss, readOnly }) {
  const findings = rows.filter((item) => item.v || item.c);
  const [selected, setSelected] = useState(0);
  const at = Math.min(selected, findings.length - 1);
  const current = findings[at];
  const split = useSplitWidth();
  return (
    <div ref={split.rootRef} className="wb wb-split findings-scope__split" style={splitColumns(split)}>
      <section className="qd-cards-panel wb-panel">
        <div className="wb-list" role="listbox" aria-label={t('violations.scopeListAria')}>
          {findings.map((item, i) => {
            const f = findingOfRow(item);
            const sev = isViolationRow(item) ? f.severity : 'compliant';
            return (
              <button key={rowKey(item, i)} type="button" role="option" aria-selected={i === at}
                className={`wb-row wb-row--${sev}${i === at ? ' is-sel' : ''}`} onClick={() => setSelected(i)}>
                <span className="wb-row__t">{isViolationRow(item) ? '' : '✓ '}{f.title || f.principle}</span>
                <span className="wb-row__f wb-row__f--line">{whereOf(f, within)}</span>
                <span className="wb-row__meta">{[isViolationRow(item) ? severityLabel(f.severity) : t('violations.scopeCompliantShort'), principleOf(f, within)].filter(Boolean).join(SEP)}</span>
              </button>
            );
          })}
        </div>
      </section>
      <SplitDivider split={split} />
      <section className="qd-cards-panel wb-panel wb-detail">
        <div className="wb-detail__body">
          {current && (isViolationRow(current)
            ? <FindingCard v={current.v} within={within} onDismiss={onDismiss} readOnly={readOnly} />
            : <article className="findings-card"><header className="findings-card__head"><span className="findings-check__mark">✓</span><h3 className="findings-card__title">{current.c.title || current.c.principle}</h3></header>
              <div className="findings-card__meta"><span>{[principleOf(current.c, within), whereOf(current.c, within)].filter(Boolean).join(SEP)}</span></div><Body item={current.c} /></article>)}
        </div>
      </section>
    </div>
  );
}
