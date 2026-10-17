/**
 * Dismiss every open finding of the selected finding's rule, in the project
 * or in its principle: bulk actions, so they wait behind the detail's quiet
 * ⋯ rather than sit beside the one-finding dismiss. The menu is portaled, so
 * the detail panel's scroll box cannot clip it; the confirmation is
 * useDismissByType's.
 */
import MoreMenu from '../../../components/launcher/MoreMenu.jsx';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';
import { DISMISS_SCOPE } from '../violationsVocab.js';
import { principleCount } from '../hooks/useDismissByType.js';

function scopes(row) {
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

export default function DismissRuleMenu({ row, onDismissType }) {
  const items = scopes(row).map((s) => ({ key: s.scope, label: s.label, onPick: () => onDismissType(row, s.scope) }));
  return <MoreMenu ariaLabel={t('violations.wbRuleMore', { req: row.req })} items={items} />;
}
