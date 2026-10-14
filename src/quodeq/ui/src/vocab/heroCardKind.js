import { FINDING_TYPE } from './findingType.js';

// The clickable findings numbers (the Overview's hero cards, the dimension
// page's header tiles): 'violations' is its own kind (every violation, no
// severity filter); COMPLIANCE reuses FINDING_TYPE.COMPLIANCE since it is
// the same value read back by the findings filters. A severity level
// (critical/major/minor) passes through unchanged as its own kind.
export const HERO_CARD_KIND = Object.freeze({ VIOLATIONS: 'violations', COMPLIANCE: FINDING_TYPE.COMPLIANCE });
