import { useEffect, useMemo, useRef, useState } from 'react';
import { previewGradeFormula } from '../../../api/index.js';
import { knobChanges } from '../knobs/knobGroups.js';
import { principleShifts } from '../impact/impactModel.js';
import { effectKey, serverFlips, REVIEW_MODE } from './reviewModel.js';
import { KEY } from '../../../vocab/keyboard.js';
import { t } from '../../../strings/index.js';
import { PERCENT } from '../../../constants.js';
import { trapTab } from '../../../utils/a11y.js';

function useServerPreview(target) {
  const [state, setState] = useState({ payload: null, failed: false });
  useEffect(() => {
    let live = true;
    previewGradeFormula(target)
      .then((payload) => { if (live) setState({ payload, failed: false }); })
      .catch(() => { if (live) setState({ payload: null, failed: true }); });
    return () => { live = false; };
  }, [target]);
  return state;
}

const pct = (from, to) => (from ? Math.round(((to - from) / from) * PERCENT) : 0);

function ChangesTable({ changes }) {
  return (
    <table className="gf-review__table">
      <thead><tr>
        <th>{t('gradeFormula.colSetting')}</th><th>{t('gradeFormula.colToday')}</th><th>{t('gradeFormula.colNew')}</th>
        <th>{t('gradeFormula.colChange')}</th><th>{t('gradeFormula.colEffect')}</th>
      </tr></thead>
      <tbody>
        {changes.map((c) => (
          <tr key={`${c.group.id}-${c.knob.id}`}>
            <td>{t(c.group.titleKey)}<span className="gf-review__knob">{t(c.knob.labelKey)}</span></td>
            <td className="num">{c.from}</td><td className="num gf-review__new">{c.to}</td>
            <td className="num">{pct(c.from, c.to) > 0 ? '+' : ''}{pct(c.from, c.to)}%</td>
            <td>{t(effectKey(c))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cards({ server, shifts, names }) {
  const flips = server.payload ? serverFlips(server.payload, names) : null;
  return (
    <div className="gf-review__cards">
      <section className="gf-review__card">
        <h3>{t('gradeFormula.cardFlips')}</h3>
        {flips === null && !server.failed && <p>{t('gradeFormula.reviewScoring')}</p>}
        {flips && flips.length === 0 && <p>{t('gradeFormula.cardFlipsNone')}</p>}
        {flips && flips.length > 0 && (
          <ul>{flips.map((f) => <li key={f.id}><b>{f.name}</b> {f.from} → {f.to} ({f.before} → {f.after})</li>)}</ul>
        )}
      </section>
      <section className="gf-review__card"><h3>{t('gradeFormula.cardPrinciples')}</h3><p>{t('gradeFormula.cardPrinciplesBody', shifts)}</p></section>
      <section className="gf-review__card">
        <h3>{t('gradeFormula.cardHistory')}</h3>
        <p>{server.payload ? t('gradeFormula.cardHistoryBody', { runs: server.payload.runsToRescore }) : t('gradeFormula.cardHistoryPending')}</p>
      </section>
      <section className="gf-review__card"><h3>{t('gradeFormula.cardBack')}</h3><p>{t('gradeFormula.cardBackBody')}</p></section>
    </div>
  );
}

/** What an apply or a reset will do, before it does it. */
export default function ReviewSheet({ mode, target, saved, inputs, names, busy, onConfirm, onCancel }) {
  const headingRef = useRef(null);
  const server = useServerPreview(target);
  const changes = useMemo(() => knobChanges(target, saved), [target, saved]);
  const shifts = useMemo(
    () => (inputs ? principleShifts(inputs, saved, target) : { moved: 0, up: 0, down: 0 }),
    [inputs, saved, target],
  );
  const dialogRef = useRef(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === KEY.ESCAPE) cancelRef.current();
      else if (dialogRef.current) trapTab(dialogRef.current, e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const reset = mode === REVIEW_MODE.RESET;
  const runs = server.payload?.runsToRescore;
  const confirmLabel = runs == null
    ? t(reset ? 'gradeFormula.resetNow' : 'gradeFormula.applyNow')
    : t(reset ? 'gradeFormula.resetRuns' : 'gradeFormula.applyRuns', { runs });
  return (
    <div className="gf-review__backdrop">
      <div className="panel gf-review" role="dialog" aria-modal="true" aria-labelledby="gf-review-title" ref={dialogRef}>
        <h2 id="gf-review-title" className="gf-review__title" tabIndex={-1} ref={headingRef}>
          {t(reset ? 'gradeFormula.reviewResetTitle' : 'gradeFormula.reviewTitle')}
        </h2>
        <ChangesTable changes={changes} />
        <Cards server={server} shifts={shifts} names={names} />
        {server.failed && <p className="gf-review__failed">{t('gradeFormula.reviewFailed')}</p>}
        <div className="gf-review__actions">
          <button type="button" className="settings-pill settings-pill--active" disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" className="settings-pill" onClick={onCancel}>{t('gradeFormula.keepEditing')}</button>
        </div>
      </div>
    </div>
  );
}
