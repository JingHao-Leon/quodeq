import { LauncherButton, LauncherMenu, LauncherRoot, useLauncherPopover } from '../../../components/launcher/launcherParts.jsx';

/**
 * The app's launcher with a caption (`status: open ▸`, `dismiss all R-FT-2 ▸`)
 * and a portaled menu. `children(close)` renders the items.
 */
export default function CaptionLauncher({ caption, children }) {
  const pop = useLauncherPopover();
  return (
    <LauncherRoot>
      <LauncherButton btnRef={pop.btnRef} open={pop.open} ariaLabel={caption} label={caption} onToggle={pop.toggle} />
      {pop.open && pop.pos && <LauncherMenu menuRef={pop.menuRef} pos={pop.pos}>{children(pop.close)}</LauncherMenu>}
    </LauncherRoot>
  );
}
