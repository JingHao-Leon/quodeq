import { GridTable, GridRow, GridCell } from '../../../components/terminal/index.js';
import { scoreColorClass } from '../../../utils/formatters.js';
import { scoreTierLabel } from '../../../utils/gradeFormatting.js';
import RunSevRow, { CRIT_MAJ } from './RunSevRow.jsx';
import { scoreText, DASH, PLUS, MINUS } from './runFormat.js';

const COLUMNS = 'minmax(140px, 1fr) 28px 44px 1fr 96px';

function DimMoves({ change }) {
  if (!change) return <span className="rl-moves rl-moves--none">{DASH}</span>;
  return (
    <span className="rl-moves">
      <span className={change.new ? 'rl-new' : 'rl-zero'}>{PLUS}{change.new}</span>
      <span className={change.resolved ? 'rl-fixed' : 'rl-zero'}>{MINUS}{change.resolved}</span>
    </span>
  );
}

/** One row per dimension of the run: grade, score, crit/maj, what changed. */
export default function RunDimensions({ run, diff, onOpen }) {
  const dims = [...(run.dimensionDetails || [])].sort((a, b) => a.dimension.localeCompare(b.dimension));
  return (
    <GridTable columns={COLUMNS} dense>
      {dims.map((d) => {
        const score = parseFloat(d.score);
        return (
          <GridRow key={d.dimension} onClick={() => onOpen(d)}>
            <GridCell><span className="rl-mono">{d.dimension}</span></GridCell>
            <GridCell><span className={`chip small ${scoreColorClass(score)}`}>{scoreTierLabel(score) || DASH}</span></GridCell>
            <GridCell><span className={`rl-num ${scoreColorClass(score)}`}>{scoreText(score)}</span></GridCell>
            <GridCell><RunSevRow counts={{ critical: d.critical, major: d.majors }} levels={CRIT_MAJ} /></GridCell>
            <GridCell><DimMoves change={diff?.perDim?.[d.dimension]} /></GridCell>
          </GridRow>
        );
      })}
    </GridTable>
  );
}
