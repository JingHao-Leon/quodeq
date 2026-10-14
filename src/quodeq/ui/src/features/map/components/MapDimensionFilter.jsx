import { useState, useRef, useCallback } from 'react';
import { useDismissOnOutside } from '../../../hooks/useDismissOnOutside.js';
import { t } from '../../../strings/index.js';

/** True while the Dimensions filter leaves some dimension out. */
export function dimensionsFiltered({ allDimensions, selectedDimensions }) {
  return selectedDimensions.size !== allDimensions.length;
}

/** The Map's Dimensions filter: a checkbox per dimension, hidden when there is only one. */
export function DimensionFilter({ allDimensions, selectedDimensions, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, ref, close);

  if (allDimensions.length <= 1) return null;

  const isFiltered = dimensionsFiltered({ allDimensions, selectedDimensions });

  return (
    <div className="map-filter-wrap" ref={ref}>
      <button
        type="button"
        className={`term-btn map-filter-btn${isFiltered ? ' is-filtered' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={isFiltered ? t('map.dimensionsOf', { selected: selectedDimensions.size, total: allDimensions.length }) : t('map.allDimensions')}
        aria-label={isFiltered ? t('map.dimensionsAria', { selected: selectedDimensions.size, total: allDimensions.length }) : t('map.dimensions')}
      >
        {t('map.dimensions')} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="map-filter-dropdown">
          {allDimensions.map((dim) => (
            <label key={dim} className="map-filter-item">
              <input type="checkbox" checked={selectedDimensions.has(dim)} onChange={() => onToggle(dim)} />
              <span>{dim}</span>
            </label>
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
