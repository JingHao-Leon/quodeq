import { t } from '../../../strings/index.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { sevAbbr } from './sevWords.js';

const SEP = '/';

/** root › src/ › quodeq/ ; every step but the last goes back up. */
export function Crumbs({ dir, onDir }) {
  const parts = dir.split(SEP).filter(Boolean);
  return (
    <nav className="wb-crumbs" aria-label={t('violations.wbListAria')}>
      <button type="button" className="wb-link" onClick={() => onDir('')}>{t('violations.wbRoot')}</button>
      {parts.map((name, i) => {
        const path = `${parts.slice(0, i + 1).join(SEP)}${SEP}`;
        const last = i === parts.length - 1;
        return (
          <span key={path}>
            <span className="wb-crumbs__sep" aria-hidden="true">{t('violations.wbCrumbSep')}</span>
            {last ? <span>{`${name}${SEP}`}</span>
              : <button type="button" className="wb-link" onClick={() => onDir(path)}>{`${name}${SEP}`}</button>}
          </span>
        );
      })}
    </nav>
  );
}

/** The current folder's subfolders, worst first, with their severity counts. */
export function FolderRows({ folders, dir, onDir }) {
  return folders.map((c) => (
    <button key={c.path} type="button" className="wb-folder" aria-label={t('violations.wbFolderAria', { path: c.path })}
      onClick={() => onDir(c.path)}>
      <span className="wb-folder__name" aria-hidden="true">{t('violations.wbFolderName', { name: c.path.slice(dir.length) })}</span>
      <span className="wb-folder__sev" aria-hidden="true">
        {SEVERITY_ORDER.filter((l) => c[l] > 0).map((l) => (
          <span key={l} className={`wb-sevword wb-sevword--${l}`}>{t('violations.wbSevCount', { count: c[l], sev: sevAbbr(l) })}</span>
        ))}
      </span>
      <span className="wb-folder__n" aria-hidden="true">{c.total}</span>
    </button>
  ));
}
