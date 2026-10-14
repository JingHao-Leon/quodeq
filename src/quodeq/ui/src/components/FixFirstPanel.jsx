/**
 * FixFirstPanel: the visible dimensions' requirements, most severe first.
 * A row opens that requirement's findings. On the Overview each row names
 * its dimension and principle; on a dimension page (`oneDimension`) just the
 * principle, and inside one principle (`onePrinciple`) neither. A principle
 * lit elsewhere on the page (`litPrinciple`, its card or radial point
 * hovered) lights its rows; `selectedReq` marks the row the view is
 * narrowed to.
 */
import { useMemo, useState } from 'react';
import { GridTable, GridRow, GridCell, SectionLabel } from './terminal/index.js';
import { t, LOCALE } from '../strings/index.js';
import { groupByRequirement } from '../models/findingsGrouping.js';
import ListShowMore from './ListShowMore.jsx';
import { SeverityAndFilesCells } from './SeverityBadges.jsx';

export const FIX_FIRST_SHOWN = 8;

const sameName = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/** Where a row's requirement sits, as much as the page does not already say. */
function placeOf(row, { oneDimension, onePrinciple }) {
  if (onePrinciple) return null;
  if (oneDimension) return row.principle || null;
  return row.principle ? `${row.dimension} · ${row.principle}` : row.dimension;
}

export default function FixFirstPanel({ dimensions, onRequirementClick, oneDimension = false, onePrinciple = false, selectedReq = null, note = null, litPrinciple = null }) {
  const rows = useMemo(() => groupByRequirement(dimensions), [dimensions]);
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const list = open ? rows : rows.slice(0, FIX_FIRST_SHOWN);
  return (
    <section className="qd-cards-panel fix-first-panel" aria-label={t('overview.fixFirstAria')}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('overview.fixFirstLabel')} · {rows.length.toLocaleString(LOCALE)}</SectionLabel>
        <span className="run-history-panel__stats">{note || t('overview.fixFirstNote')}</span>
      </div>
      <GridTable columns="110px minmax(0, 1fr) auto 48px" dense>
        {list.map((r) => (
          <GridRow key={`${r.dimension}:${r.req}`} selected={r.req === selectedReq} lit={Boolean(litPrinciple) && sameName(r.principle, litPrinciple)}
            onClick={onRequirementClick ? () => onRequirementClick(r) : undefined}>
            <GridCell><span className="fix-first__req">{r.req}</span></GridCell>
            <GridCell>
              <div className="offending-file-cell">
                <span className="offending-file-name">{r.text}</span>
                <span className="offending-file-path">{placeOf(r, { oneDimension, onePrinciple })}</span>
              </div>
            </GridCell>
            <SeverityAndFilesCells sev={r.sev} fileCount={r.fileCount} />
          </GridRow>
        ))}
      </GridTable>
      <ListShowMore
        open={open} total={rows.length} shown={FIX_FIRST_SHOWN}
        allLabel={t('overview.showAllRequirements', { count: rows.length.toLocaleString(LOCALE) })}
        onToggle={() => setOpen(!open)}
      />
    </section>
  );
}
