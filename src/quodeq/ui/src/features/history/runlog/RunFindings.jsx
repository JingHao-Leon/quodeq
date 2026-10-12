import { GridTable, GridRow, GridCell } from '../../../components/terminal/index.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { t } from '../../../strings/index.js';
import { sevAbbr } from './RunSevText.jsx';

const COLUMNS = 'minmax(0, 1fr) minmax(0, 240px)';

function groupByDimension(list) {
  const groups = [];
  list.forEach((f) => {
    const g = groups.at(-1);
    if (g && g.dim === f.dimension) g.items.push(f);
    else groups.push({ dim: f.dimension, items: [f] });
  });
  return groups;
}

/** `11 maj · 3 min`, each count in its severity's colour. */
function GroupSeverities({ items }) {
  const counts = {};
  items.forEach((f) => { counts[f.severity] = (counts[f.severity] || 0) + 1; });
  return SEVERITY_ORDER.filter((l) => counts[l]).map((l, i) => (
    <span key={l} className={`rl-sevword rl-sevword--${l}`}>{i ? ' · ' : ' '}{t('history.sevCount', { count: counts[l], sev: sevAbbr(l) })}</span>
  ));
}

/**
 * New or resolved findings, grouped by dimension; a row opens the finding.
 * Severity is the app's coloured left edge (as Evaluate's finding rows) and a
 * coloured count in the group label.
 */
export default function RunFindings({ list, onOpen }) {
  return groupByDimension(list).map((g) => (
    <div key={g.dim} className="rl-fgroup">
      <div className="rl-fgroup__dim">{g.dim} ·<GroupSeverities items={g.items} /></div>
      <GridTable columns={COLUMNS} dense>
        {g.items.map((f, i) => (
          <GridRow key={`${f.file}:${f.line}:${i}`} onClick={() => onOpen(f)}>
            <GridCell><span className={`rl-frow__t rl-frow__t--${f.severity}`} title={f.reason || f.title}>{f.title}<small>{f.principle}</small></span></GridCell>
            <GridCell><span className="rl-frow__f" title={`${f.file}:${f.line ?? ''}`}>{f.file}{f.line ? `:${f.line}` : ''}</span></GridCell>
          </GridRow>
        ))}
      </GridTable>
    </div>
  ));
}
