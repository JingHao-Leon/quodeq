import { pluralKey } from '../../../../utils/plural.js';

/**
 * The catalog key for a file's "file: N violations" bubble name, used by the
 * galaxy view's keyboard items. The catalog has no pluralisation, so a count
 * of one takes its own key.
 */
export function riskBubbleKey(violations) {
  return pluralKey(violations, 'map.riskBubbleAriaOne', 'map.riskBubbleAria');
}
