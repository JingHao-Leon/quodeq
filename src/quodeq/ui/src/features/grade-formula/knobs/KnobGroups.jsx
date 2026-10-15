import { useMemo, useState } from 'react';
import KnobSlider from './KnobSlider.jsx';
import GradeBoundaryBar from '../GradeBoundaryBar.jsx';
import { GROUPS, KNOB_GROUP } from './knobGroups.js';
import { groupReach, allPrinciples } from '../impact/impactModel.js';
import { t } from '../../../strings/index.js';

// How many principles the group moves on its own, and that said in words.
function reachOf(group, inputs, saved, draft) {
  if (!inputs) return { count: 0, text: null };
  const total = allPrinciples(inputs).length;
  const count = groupReach(group, inputs, saved, draft);
  if (count === 0) return { count, text: t('gradeFormula.reachNone') };
  return { count, text: t(group.labelsOnly ? 'gradeFormula.reachLabels' : 'gradeFormula.reachMoves', { count, total }) };
}

function GroupKnobs({ group, draft, saved, defaults, update }) {
  if (group.id === KNOB_GROUP.BANDS) {
    return <GradeBoundaryBar thresholds={draft.gradeThresholds} onChange={(next) => update({ gradeThresholds: next })} />;
  }
  return group.knobs.map((knob) => (
    <KnobSlider key={knob.id} knob={knob} value={knob.get(draft)} savedValue={knob.get(saved)}
      defaultValue={knob.get(defaults)} onChange={(v) => update(knob.patch(draft, v))} />
  ));
}

function KnobGroup({ group, draft, saved, defaults, inputs, update, onHoverGroup }) {
  const reach = useMemo(() => reachOf(group, inputs, saved, draft), [group, inputs, saved, draft]);
  const leave = () => onHoverGroup(null);
  return (
    <section className={`gf-group${reach.count > 0 ? ' gf-group--reaching' : ''}`}
      aria-label={t(group.titleKey)}
      onMouseEnter={() => onHoverGroup(group.id)} onMouseLeave={leave}
      onFocus={() => onHoverGroup(group.id)} onBlur={leave}>
      <div className="gf-group__head">
        <h3 className="gf-group__title">{t(group.titleKey)}</h3>
        {reach.text && <span className="gf-group__reach">{reach.text}</span>}
      </div>
      <p className="gf-group__question">{t(group.questionKey)}</p>
      <GroupKnobs group={group} draft={draft} saved={saved} defaults={defaults} update={update} />
      {group.id === KNOB_GROUP.COST && (
        <span className="gf-group__note">{t('gradeFormula.criticalRatio', { ratio: Math.round(draft.severityWeight.critical / draft.severityWeight.minor) })}</span>
      )}
    </section>
  );
}

const offDefault = (group, draft, defaults) => group.knobs.some((k) => k.get(draft) !== k.get(defaults));

/** The knob groups: the two that matter most open, the rest under Fine-tune. */
export default function KnobGroups(props) {
  const { draft, defaults } = props;
  const [opened, setOpened] = useState(false);
  const folded = GROUPS.filter((g) => g.folded);
  const open = opened || folded.some((g) => offDefault(g, draft, defaults));
  return (
    <div className="gf-groups">
      {GROUPS.filter((g) => !g.folded).map((g) => <KnobGroup key={g.id} group={g} {...props} />)}
      <button type="button" className="gf-finetune" aria-expanded={open} onClick={() => setOpened(!open)}>
        {t('gradeFormula.fineTune')}
      </button>
      {open && folded.map((g) => <KnobGroup key={g.id} group={g} {...props} />)}
    </div>
  );
}
