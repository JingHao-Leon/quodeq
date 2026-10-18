import { LauncherMenu, LauncherRoot, useLauncherPopover } from './launcherParts.jsx';

/** A launcher menu's action items: picking one closes the menu, then runs it. */
export function MenuItems({ items, close }) {
  return items.map((item) => (
    <button key={item.key} type="button" role="menuitem"
      className={item.danger ? 'compare-dueltrigger__item compare-dueltrigger__item--danger' : 'compare-dueltrigger__item'}
      onClick={() => { close(); item.onPick(); }}>
      <span>{item.label}</span>
    </button>
  ));
}

/**
 * Rare actions behind a quiet ⋯, so the screen keeps one strong action.
 * `items` are `{key, label, onPick, danger?}`; picking one closes the menu
 * and runs it (any confirmation is the action's own).
 */
export default function MoreMenu({ ariaLabel, items }) {
  const { open, pos, btnRef, menuRef, close, toggle } = useLauncherPopover();
  return (
    <LauncherRoot>
      <button ref={btnRef} type="button" className="launcher-more" aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} onClick={toggle}>⋯</button>
      {open && pos && (
        <LauncherMenu menuRef={menuRef} pos={pos}>
          <MenuItems items={items} close={close} />
        </LauncherMenu>
      )}
    </LauncherRoot>
  );
}
