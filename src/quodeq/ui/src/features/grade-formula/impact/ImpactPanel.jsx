import { useMemo, useState } from 'react';
import { projectImpact, principleShifts, gradeDistribution, GRADE_ORDER, GRADE_CLASS } from './impactModel.js';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';

// A score change of this many points fills half the change bar.
const FULL_BAR_POINTS = 2;
const HALF_BAR_PERCENT = 50;
const fmt = (v) => (v == null ? '-' : v.toFixed(1));

function ChangeBar({ before, after }) {
  if (before == null || after == null || before === after) return <span className="gf-impact-bar" aria-hidden="true" />;
  const width = Math.min(HALF_BAR_PERCENT, (Math.abs(after - before) / FULL_BAR_POINTS) * HALF_BAR_PERCENT);
  const side = after < before ? { right: '50%' } : { left: '50%' };
  return (
    <span className="gf-impact-bar" aria-hidden="true">
      <i className={after < before ? 'gf-impact-bar__down' : 'gf-impact-bar__up'} style={{ ...side, width: `${width}%` }} />
    </span>
  );
}

function ProjectRow({ row, lit, onLitProject }) {
  const [open, setOpen] = useState(false);
  const moved = row.before.overall !== row.after.overall;
  const grade = row.flips ? `${row.before.grade} → ${row.after.grade}` : row.after.grade;
  return (
    <li className={`gf-impact-row${lit ? ' gf-impact-row--lit' : ''}`}>
      <button type="button" className="gf-impact-row__main" aria-expanded={open} onClick={() => setOpen(!open)}
        onMouseEnter={() => onLitProject(row.id)} onMouseLeave={() => onLitProject(null)}
        onFocus={() => onLitProject(row.id)} onBlur={() => onLitProject(null)}>
        <span className="gf-impact-row__name">{row.name}</span>
        <span className="gf-impact-row__score">
          {moved && <span className="gf-impact-row__was">{fmt(row.before.overall)} → </span>}
          {fmt(row.after.overall)}
        </span>
        {row.after.grade && (
          <span className={`chip small grade-${GRADE_CLASS[row.after.grade]}${row.flips ? ' gf-impact-row__flip' : ''}`}>{grade}</span>
        )}
        <ChangeBar before={row.before.overall} after={row.after.overall} />
      </button>
      {open && (
        <ul className="gf-impact-row__dims">
          {row.after.dims.map((d, i) => (
            <li key={d.dimension}>
              <span>{d.dimension}</span>
              <span>{row.before.dims[i].score !== d.score && <span className="gf-impact-row__was">{fmt(row.before.dims[i].score)} → </span>}{fmt(d.score)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function DistBar({ counts }) {
  return (
    <span className="gf-dist__bar">
      {[...GRADE_ORDER].reverse().filter((g) => counts[g] > 0).map((g) => (
        <span key={g} className={`gf-dist__seg grade-${GRADE_CLASS[g]}`} style={{ flex: counts[g] }} title={`${g}: ${counts[g]}`}>{counts[g]}</span>
      ))}
    </span>
  );
}

function Distribution({ inputs, saved, draft }) {
  const today = useMemo(() => gradeDistribution(inputs, saved), [inputs, saved]);
  const next = useMemo(() => gradeDistribution(inputs, draft), [inputs, draft]);
  return (
    <div className="gf-dist">
      <h3 className="gf-dist__title">{t('gradeFormula.impactDistLabel')}</h3>
      <div className="gf-dist__row"><span>{t('gradeFormula.distToday')}</span><DistBar counts={today} /></div>
      <div className="gf-dist__row"><span>{t('gradeFormula.distDraft')}</span><DistBar counts={next} /></div>
    </div>
  );
}

function Headline({ rows, shifts, isDirty }) {
  if (!isDirty) return <p className="gf-impact__headline">{t('gradeFormula.impactRest')}</p>;
  return (
    <p className="gf-impact__headline">
      {t('gradeFormula.impactFlips', { count: rows.filter((r) => r.flips).length, total: rows.length })}
      {' '}
      {t('gradeFormula.impactPrinciples', shifts)}
    </p>
  );
}

function Failed({ onRetry }) {
  return (
    <div className="gf-impact__note">
      <p>{t('gradeFormula.impactFailed')}</p>
      <button type="button" className="settings-pill" onClick={onRetry}>{t('gradeFormula.retry')}</button>
    </div>
  );
}

function Body({ inputs, loading, failed, names, saved, draft, isDirty, litProject, onLitProject, onRetry }) {
  const rows = useMemo(() => (inputs ? projectImpact(inputs, names, saved, draft) : []), [inputs, names, saved, draft]);
  const shifts = useMemo(() => (inputs ? principleShifts(inputs, saved, draft) : null), [inputs, saved, draft]);
  if (loading) return <p className="gf-impact__note">{t('gradeFormula.impactLoading')}</p>;
  if (failed) return <Failed onRetry={onRetry} />;
  if (rows.length === 0) return <p className="gf-impact__note">{t('gradeFormula.impactEmpty')}</p>;
  return (
    <>
      <Headline rows={rows} shifts={shifts} isDirty={isDirty} />
      <ul className="gf-impact__rows">
        {rows.map((r) => <ProjectRow key={r.id} row={r} lit={litProject === r.id} onLitProject={onLitProject} />)}
      </ul>
      <Distribution inputs={inputs} saved={saved} draft={draft} />
    </>
  );
}

/** What the draft does to every project, beside the knobs, with the actions. */
export default function ImpactPanel(props) {
  const { isDirty, isCustom, busy, changedCount, actionsRef, onReview, onUndo, onReset } = props;
  return (
    <aside className="panel gf-impact" aria-label={t('gradeFormula.impactLabel')}>
      <div className="panel-header"><span className="gf-impact__label">{t('gradeFormula.impactLabel')}</span></div>
      <div className="gf-impact__body"><Body {...props} /></div>
      <div className="gf-impact__actions" ref={actionsRef} tabIndex={-1}>
        <button type="button" className="settings-pill settings-pill--active" disabled={!isDirty || busy} onClick={onReview}>
          {t('gradeFormula.reviewApply')}
        </button>
        <button type="button" className="settings-pill" disabled={!isDirty || busy} onClick={onUndo}>{t('gradeFormula.undoAll')}</button>
        <button type="button" className="settings-pill" disabled={busy || (!isCustom && !isDirty)} onClick={onReset}>{t('gradeFormula.resetQ')}</button>
        {changedCount > 0 && (
          <span className="gf-impact__changed">{t(pluralKey(changedCount, 'gradeFormula.changedOne', 'gradeFormula.changedMany'), { count: changedCount })}</span>
        )}
      </div>
    </aside>
  );
}
