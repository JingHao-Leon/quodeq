import { useEffect, useMemo, useState } from 'react';
import { TermInput } from '../../../components/terminal/index.js';
import { t } from '../../../strings/index.js';
import { KEY } from '../../../vocab/keyboard.js';
import { pathSuggestions } from './folderModel.js';

/**
 * The app's `$ grep -r` input. A path-like query offers matching folders and
 * files with their finding counts; picking one becomes a path chip.
 */
export default function WorkbenchSearch({ findings, q, onQuery, onPickPath, inputRef }) {
  const [hidden, setHidden] = useState(false);
  const suggestions = useMemo(() => pathSuggestions(findings, q), [findings, q]);
  useEffect(() => setHidden(false), [q]);
  const pick = (path) => { onPickPath(path); onQuery(''); };
  return (
    <div className="wb-search" ref={inputRef}>
      <TermInput command={t('violations.wbSearchCommand')} placeholder={t('violations.wbSearchPlaceholder')}
        value={q} onChange={onQuery}
        onKeyDown={(e) => { if (e.key === KEY.ESCAPE) setHidden(true); }} ariaLabel={t('violations.wbSearchAria')} />
      {!hidden && suggestions.length > 0 && (
        <div className="wb-sugg" role="listbox" aria-label={t('violations.wbSuggestHint')}>
          <span className="compare-dueltrigger__hint">{t('violations.wbSuggestHint')}</span>
          {suggestions.map(([path, count]) => (
            <button key={path} type="button" role="option" aria-selected={false} className="compare-dueltrigger__item"
              onMouseDown={(e) => { e.preventDefault(); pick(path); }}>
              <span className="wb-sugg__path">{path}</span>
              <span className="wb-menu__count">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
