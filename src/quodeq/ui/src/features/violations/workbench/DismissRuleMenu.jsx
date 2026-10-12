/**
 * Dismiss every open finding of the selected finding's rule, in the project
 * or in its principle. The app's launcher (`dismiss all R-FT-2 ▸`), portaled
 * so the detail panel's scroll box cannot clip it.
 */
import CaptionLauncher from './CaptionLauncher.jsx';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';
import { DISMISS_SCOPE } from '../violationsVocab.js';
import { principleCount } from '../hooks/useDismissByType.js';

function scopes(row) {
  const inPrinciple = principleCount(row);
  const out = [{
    scope: DISMISS_SCOPE.PROJECT,
    label: t(pluralKey(row.now, 'violations.dismissAllProjectOne', 'violations.dismissAllProject'), { count: row.now }),
  }];
  if (row.principle) {
    out.push({
      scope: DISMISS_SCOPE.PRINCIPLE,
      label: t(pluralKey(inPrinciple, 'violations.dismissAllPrincipleOne', 'violations.dismissAllPrinciple'), { count: inPrinciple, principle: row.principle }),
    });
  }
  return out;
}

export default function DismissRuleMenu({ row, onDismissType }) {
  return (
    <CaptionLauncher caption={t('violations.wbDismissRule', { req: row.req })}>
      {(close) => scopes(row).map((s) => (
        <button key={s.scope} type="button" role="menuitem" className="compare-dueltrigger__item"
          onClick={() => { close(); onDismissType(row, s.scope); }}>
          <span>{s.label}</span>
        </button>
      ))}
    </CaptionLauncher>
  );
}
