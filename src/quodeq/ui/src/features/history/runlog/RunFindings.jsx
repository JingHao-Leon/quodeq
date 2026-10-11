import { SevBadge, GridTable, GridRow, GridCell } from '../../../components/terminal/index.js';

const COLUMNS = '52px minmax(0, 1fr) minmax(0, 240px)';

function groupByDimension(list) {
  const groups = [];
  list.forEach((f) => {
    const g = groups.at(-1);
    if (g && g.dim === f.dimension) g.items.push(f);
    else groups.push({ dim: f.dimension, items: [f] });
  });
  return groups;
}

/** New or resolved findings, grouped by dimension; a row opens the finding. */
export default function RunFindings({ list, onOpen }) {
  return groupByDimension(list).map((g) => (
    <div key={g.dim} className="rl-fgroup">
      <div className="rl-fgroup__dim">{g.dim} · {g.items.length}</div>
      <GridTable columns={COLUMNS} dense>
        {g.items.map((f, i) => (
          <GridRow key={`${f.file}:${f.line}:${i}`} onClick={() => onOpen(f)}>
            <GridCell><SevBadge level={f.severity} /></GridCell>
            <GridCell><span className="rl-frow__t" title={f.reason || f.title}>{f.title}<small>{f.principle}</small></span></GridCell>
            <GridCell><span className="rl-frow__f" title={`${f.file}:${f.line ?? ''}`}>{f.file}{f.line ? `:${f.line}` : ''}</span></GridCell>
          </GridRow>
        ))}
      </GridTable>
    </div>
  ));
}
