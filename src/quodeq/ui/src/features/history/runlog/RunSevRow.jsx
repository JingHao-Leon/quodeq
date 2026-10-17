import { SevBadge } from '../../../components/terminal/index.js';
import { SEVERITY, SEVERITY_ORDER } from '../../../vocab/severity.js';

export const MAJOR_ONLY = [SEVERITY.MAJOR];

/** The severity badges of a count set, each with its change against a baseline. */
export default function RunSevRow({ counts, deltas, levels = SEVERITY_ORDER }) {
  return (
    <span className="rl-sev">
      {levels.map((l) => (counts?.[l] || deltas?.[l]
        ? <SevBadge key={l} level={l} format="count-abbr" count={counts[l]} delta={deltas?.[l] || null} />
        : null))}
    </span>
  );
}
