import { t } from '../strings/index.js';

/** What the "Where" panel shows: the Map's areas, the folders, or the files. */
export const WHERE = Object.freeze({ AREAS: 'areas', FOLDERS: 'folders', FILES: 'files' });
/** The views in switch order: areas first, as the Map measures them, then folders and files. */
export const WHERE_VIEWS = Object.freeze([WHERE.AREAS, WHERE.FOLDERS, WHERE.FILES]);

/**
 * Where the findings are, one level at a time: a switch over the one panel
 * it shows (the Overview's and the dimension page's bottom right).
 * @param {{view: string, onView: (view: string) => void, children: React.ReactNode, views?: string[]}} props
 */
export default function WherePanel({ view, onView, children, views = WHERE_VIEWS }) {
  return (
    <section className="explorer-where" aria-label={t('explorer.whereAria')}>
      <div className="term-seg explorer-where__switch" role="group" aria-label={t('explorer.whereAria')}>
        {views.map((v) => (
          <button key={v} type="button" className={`term-btn${v === view ? ' term-btn--on' : ''}`} aria-pressed={v === view} onClick={() => onView(v)}>
            {t(`explorer.where_${v}`)}
          </button>
        ))}
      </div>
      {children}
    </section>
  );
}
