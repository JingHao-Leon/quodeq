import { useState, useRef, useCallback, useId } from 'react';
import { useDismissOnOutside } from '../../../hooks/useDismissOnOutside.js';
import { t } from '../../../strings/index.js';

/** True while the Dimensions filter leaves some dimension out. */
export function dimensionsFiltered({ allDimensions, selectedDimensions }) {
  return selectedDimensions.size !== allDimensions.length;
}

/** What the closed button says: "Dimensions" for all, the name for one, "name +N" for several. */
export function dimensionsButtonLabel({ allDimensions, selectedDimensions }) {
  if (!dimensionsFiltered({ allDimensions, selectedDimensions })) return t('map.dimensions');
  const kept = allDimensions.filter((d) => selectedDimensions.has(d));
  if (kept.length === 1) return kept[0];
  return t('map.dimensionsMore', { name: kept[0], count: kept.length - 1 });
}

/** One dimension row: the checkbox adds or removes it, the name keeps only it. */
function DimensionRow({ dim, checked, isLastKept, onToggle, onShowOnly }) {
  return (
    <div className="map-filter-item">
      <input type="checkbox" checked={checked} disabled={isLastKept} onChange={() => onToggle(dim)}
        aria-label={t('map.dimensionToggleAria', { name: dim })} />
      <button type="button" className="map-filter-only" onClick={() => onShowOnly(dim)}
        aria-label={t('map.dimensionOnlyAria', { name: dim })}>
        <span className="map-filter-only__name">{dim}</span>
        <span className="map-filter-only__hint" aria-hidden="true">{t('map.dimensionOnly')}</span>
      </button>
    </div>
  );
}

/**
 * The Map's Dimensions filter, hidden when there is only one dimension.
 * Clicking a name shows only that dimension and closes the menu; the
 * checkboxes combine several and keep it open. The last kept dimension's
 * checkbox is disabled: "All dimensions" is the way back to everything.
 */
export function DimensionFilter({ allDimensions, selectedDimensions, onToggle, onShowOnly }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, ref, close);

  if (allDimensions.length <= 1) return null;

  const isFiltered = dimensionsFiltered({ allDimensions, selectedDimensions });
  const showOnly = (dim) => { onShowOnly(dim); setOpen(false); };

  return (
    <div className="map-filter-wrap" ref={ref}>
      <button
        type="button"
        className={`term-btn map-filter-btn${isFiltered ? ' is-filtered' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title={isFiltered ? t('map.dimensionsOf', { selected: selectedDimensions.size, total: allDimensions.length }) : t('map.allDimensions')}
        aria-label={isFiltered ? t('map.dimensionsAria', { selected: selectedDimensions.size, total: allDimensions.length }) : t('map.dimensions')}
      >
        {dimensionsButtonLabel({ allDimensions, selectedDimensions })} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="map-filter-dropdown" id={listId}>
          <button type="button" className={`map-filter-all${isFiltered ? '' : ' is-on'}`} onClick={() => showOnly(null)}
            aria-pressed={!isFiltered}>
            {t('map.allDimensions')}
          </button>
          <div className="map-filter-sep" />
          {allDimensions.map((dim) => (
            <DimensionRow key={dim} dim={dim} checked={selectedDimensions.has(dim)}
              isLastKept={selectedDimensions.size === 1 && selectedDimensions.has(dim)}
              onToggle={onToggle} onShowOnly={showOnly} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The principle the Risk tab is narrowed to; pressing it shows every principle of the dimension again. */
export function RiskPrincipleChip({ principle, onClear }) {
  if (!principle) return null;
  return (
    <button type="button" className="term-btn map-filter-btn is-filtered" onClick={onClear}
      title={t('map.riskPrincipleClear')} aria-label={t('map.riskPrincipleAria', { name: principle.name })}>
      {t('map.riskPrinciple', { name: principle.name })} ×
    </button>
  );
}
