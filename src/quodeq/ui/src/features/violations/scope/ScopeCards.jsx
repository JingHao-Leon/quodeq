import { useState } from 'react';
import ContextBlock from '../../../components/ContextBlock.jsx';
import DetailSkeleton from '../../../components/DetailSkeleton.jsx';
import { RefLinks, DowngradeTags } from '../../../components/findingDetail.jsx';
import { ViolationActions } from '../../explorer/components/violationActions.jsx';
import { severityLabel } from '../../../strings/labels.js';
import { t } from '../../../strings/index.js';

export const SEP = ' · ';
/** A compliant check's mark. */
export const CHECK_MARK = '\u2713';
/** The principle beside a finding, left out inside a principle scope (the principle is the page). */
export const principleOf = (item, { inPrinciple }) => (inPrinciple ? null : item.principle);

/** Where a finding is: its line inside a file scope (the file is the page), else file:line. */
export function whereOf(item, { inFile }) {
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
        <DowngradeTags v={v} />
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
        <span className="findings-check__mark" aria-hidden="true">{CHECK_MARK}</span>
        <span className="findings-check__title">{c.title || c.principle}</span>
        <span className="findings-check__meta">{meta}</span>
      </button>
      {open && <div className="findings-check__body"><Body item={c} /></div>}
    </article>
  );
}

/** A compliant check in full, beside the list: its title, where it is, its reason and code. */
export function CompliantDetail({ c, within }) {
  return (
    <article className="findings-card">
      <header className="findings-card__head">
        <span className="findings-check__mark" aria-hidden="true">{CHECK_MARK}</span>
        <h3 className="findings-card__title">{c.title || c.principle}</h3>
      </header>
      <div className="findings-card__meta"><span>{[principleOf(c, within), whereOf(c, within)].filter(Boolean).join(SEP)}</span></div>
      <Body item={c} />
    </article>
  );
}
