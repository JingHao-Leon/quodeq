import { t } from '../../../strings/index.js';
import {
  LauncherButton,
  LauncherMenu,
  LauncherRoot,
  useLauncherPopover,
} from '../../../components/launcher/launcherParts.jsx';
import LauncherScore from './LauncherScore.jsx';

function DimensionTriggerMenu({ menuRef, pos, board, current, onPick }) {
  return (
    <LauncherMenu menuRef={menuRef} pos={pos}>
      {board.map((b) => (
        <button
          key={b.key}
          type="button"
          role={current ? 'menuitemradio' : 'menuitem'}
          aria-checked={current ? b.key === current.key : undefined}
          className={`compare-dueltrigger__item${current?.key === b.key ? ' compare-dueltrigger__item--current' : ''}`}
          onClick={() => onPick(b.key)}
        >
          <span>{current?.key === b.key ? '✓ ' : ''}{b.label}</span>
          <LauncherScore score={b.avg} />
        </button>
      ))}
    </LauncherMenu>
  );
}

/* Dimension trigger — the duel button's sibling: one pick, straight into
   that dimension's drill-down. Same list the DIMENSIONS board shows,
   with the scope average alongside each name. With `current` (a board
   entry) it is the dimension page's switcher: the button names it and the
   menu ticks it. */
export default function DimensionTrigger({ board, onOpen, current = null }) {
  const { open, pos, btnRef, menuRef, close, toggle } = useLauncherPopover();

  return (
    <LauncherRoot>
      <LauncherButton
        btnRef={btnRef}
        open={open}
        ariaLabel={current ? t('compare.dimSwitchAria', { name: current.label }) : t('compare.dimLaunchAria')}
        label={current ? t('compare.dimCurrent', { name: current.label }) : t('compare.dimOpen')}
        onToggle={toggle}
      />
      {open && pos && (
        <DimensionTriggerMenu
          menuRef={menuRef}
          pos={pos}
          board={board}
          current={current}
          onPick={(key) => { close(); onOpen(key); }}
        />
      )}
    </LauncherRoot>
  );
}
