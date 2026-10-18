/**
 * The detail's dismiss pill: this finding, or every open finding of its rule
 * in the project or in its principle. Without a rule row it dismisses the
 * finding at once. The menu is portaled, so the detail panel's scroll box
 * cannot clip it; the bulk confirmation is useDismissByType's.
 */
import { LauncherMenu, LauncherRoot, useLauncherPopover } from '../../../components/launcher/launcherParts.jsx';
import { MenuItems } from '../../../components/launcher/MoreMenu.jsx';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';
import { DISMISS_SCOPE } from '../violationsVocab.js';
import { principleCount } from '../hooks/useDismissByType.js';

const OPEN_MARK = '▾';
const CLOSED_MARK = '▸';

function ruleScopes(row) {
  const inPrinciple = principleCount(row);
  const out = [{
    scope: DISMISS_SCOPE.PROJECT,
    label: t(pluralKey(row.now, 'violations.dismissAllProjectOne', 'violations.dismissAllProject'), { count: row.now, req: row.req }),
  }];
  if (row.principle) {
    out.push({
      scope: DISMISS_SCOPE.PRINCIPLE,
      label: t(pluralKey(inPrinciple, 'violations.dismissAllPrincipleOne', 'violations.dismissAllPrinciple'),
        { count: inPrinciple, req: row.req, principle: row.principle }),
    });
  }
  return out;
}

export default function DismissMenu({ onDismiss, row, onDismissType }) {
  const pop = useLauncherPopover();
  if (!row) {
    return <button type="button" className="eval-pill-btn" onClick={onDismiss}>{t('violations.wbDismiss')}</button>;
  }
  const items = [
    { key: 'one', label: t('violations.wbDismissOne'), onPick: onDismiss },
    ...ruleScopes(row).map((s) => ({ key: s.scope, label: s.label, onPick: () => onDismissType(row, s.scope) })),
  ];
  return (
    <LauncherRoot>
      <button ref={pop.btnRef} type="button" className="eval-pill-btn" aria-haspopup="menu" aria-expanded={pop.open}
        aria-label={t('violations.wbDismissMenu', { req: row.req })} onClick={pop.toggle}>
        {t('violations.wbDismiss')} {pop.open ? OPEN_MARK : CLOSED_MARK}
      </button>
      {pop.open && pop.pos && (
        <LauncherMenu menuRef={pop.menuRef} pos={pop.pos}>
          <MenuItems items={items} close={pop.close} />
        </LauncherMenu>
      )}
    </LauncherRoot>
  );
}
