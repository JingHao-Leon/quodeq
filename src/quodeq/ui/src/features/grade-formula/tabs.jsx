import ParamSlider from './ParamSlider.jsx';
import { t } from '../../strings/index.js';

/**
 * The per-dimension weights and the toggle that decides whether they apply at
 * all (off means a plain mean across dimensions).
 * @param {object} props.draft - the draft formula being edited.
 * @param {{dimensionWeight: number[]}} props.ranges - the server's bounds, from the formula GET.
 * @param {(patch: object) => void} props.update - merges a patch into the draft.
 */
export function DimensionsTab({ draft, ranges, update }) {
  const enabled = draft.dimensionWeightsEnabled;
  const weights = draft.dimensionWeights;
  const setDim = (dim) => (v) => update({ dimensionWeights: { ...weights, [dim]: v } });
  // The server's bounds for a dimension weight (GET's `ranges`).
  const [min, max] = ranges.dimensionWeight;
  return (
    <div>
      <button
        type="button"
        className={`settings-pill${enabled ? ' settings-pill--active' : ''}`}
        aria-pressed={enabled}
        onClick={() => update({ dimensionWeightsEnabled: !enabled })}
      >
        {enabled ? t('gradeFormula.weightsApplied') : t('gradeFormula.applyWeights')}
      </button>
      <span className="settings-description"> {t('gradeFormula.plainMean')}</span>
      <div style={{ marginTop: 10 }}>
        {Object.entries(weights).map(([dim, w]) => (
          <ParamSlider key={dim} label={dim} value={w} min={min} max={max} step={0.1}
            disabled={!enabled} onChange={setDim(dim)} />
        ))}
      </div>
    </div>
  );
}
