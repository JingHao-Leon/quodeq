import { t } from '../../../strings/index.js';
import { LauncherMenu, LauncherRoot, useLauncherPopover } from '../../../components/launcher/launcherParts.jsx';

/** Rare actions live behind a quiet ⋯, so the hero keeps one strong action. */
export default function RunMoreMenu({ onDelete }) {
  const { open, pos, btnRef, menuRef, close, toggle } = useLauncherPopover();
  return (
    <LauncherRoot>
      <button ref={btnRef} type="button" className="rl-more" aria-haspopup="menu" aria-expanded={open} aria-label={t('history.moreActions')} onClick={toggle}>⋯</button>
      {open && pos && (
        <LauncherMenu menuRef={menuRef} pos={pos}>
          <button type="button" role="menuitem" className="compare-dueltrigger__item rl-menu__danger" onClick={() => { close(); onDelete(); }}>
            <span>{t('history.deleteThisRun')}</span>
          </button>
        </LauncherMenu>
      )}
    </LauncherRoot>
  );
}
