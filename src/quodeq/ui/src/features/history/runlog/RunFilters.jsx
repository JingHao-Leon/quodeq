import { t } from '../../../strings/index.js';
import { LauncherButton, LauncherMenu, LauncherRoot, useLauncherPopover } from '../../../components/launcher/launcherParts.jsx';
import { countBy, originLabel } from './runLogModel.js';

export const FILTER_ALL = 'all';
const MIN_OPTIONS = 2;

function FilterSelect({ label, options, value, onChange }) {
  const { open, pos, btnRef, menuRef, close, toggle } = useLauncherPopover();
  if (options.length < MIN_OPTIONS) return null;
  const total = options.reduce((n, [, c]) => n + c, 0);
  const pick = (v) => { close(); onChange(v); };
  const item = (v, text, n) => (
    <button key={v} type="button" role="menuitemradio" aria-checked={value === v}
      className={`compare-dueltrigger__item${value === v ? ' rl-menu__current' : ''}`} onClick={() => pick(v)}>
      <span>{value === v ? '✓ ' : ''}{text}</span>
      <span className="rl-menu__count">{n}</span>
    </button>
  );
  return (
    <LauncherRoot>
      <LauncherButton btnRef={btnRef} open={open} ariaLabel={t('history.filterHint', { label })}
        label={t('history.filterButton', { label, value })} onToggle={toggle} />
      {open && pos && (
        <LauncherMenu menuRef={menuRef} pos={pos}>
          <span className="compare-dueltrigger__hint">{t('history.filterHint', { label })}</span>
          {item(FILTER_ALL, t('history.filterAll'), total)}
          {options.map(([v, n]) => item(v, v, n))}
        </LauncherMenu>
      )}
    </LauncherRoot>
  );
}

/** Origin and model filters over the full run list; `shown` is how many survive. */
export default function RunFilters({ rows, origin, model, onOrigin, onModel, shown }) {
  const labelled = rows.map((r) => ({ origin: originLabel(r.origin), model: r.model }));
  return (
    <div className="rl-filters">
      <FilterSelect label={t('history.filterOrigin')} options={countBy(labelled, 'origin')} value={origin} onChange={onOrigin} />
      <FilterSelect label={t('history.filterModel')} options={countBy(labelled, 'model')} value={model} onChange={onModel} />
      {(origin !== FILTER_ALL || model !== FILTER_ALL) && (
        <span className="rl-filter__count">{t('history.filterCount', { shown, total: rows.length })}</span>
      )}
    </div>
  );
}
