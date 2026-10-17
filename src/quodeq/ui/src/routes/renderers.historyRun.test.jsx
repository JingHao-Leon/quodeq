import { describe, it, expect } from 'vitest';
import { ROUTE_RENDERERS } from './renderers.jsx';
import { NAV_TAB } from '../vocab/navTab.js';

const props = { dashboardData: { onRetry: () => {} }, navigation: { handleNavigate: () => {} } };

describe('history run route', () => {
  it('tells the run page the run it opens is archived', () => {
    const el = ROUTE_RENDERERS[NAV_TAB.HISTORY_RUN]({ runId: 'r1', archived: true }, props);
    expect(el.props.runMode).toBe(true);
    expect(el.props.archivedRun).toBe(true);
  });

  it('a run opened without the mark is not archived', () => {
    expect(ROUTE_RENDERERS[NAV_TAB.HISTORY_RUN]({ runId: 'r1' }, props).props.archivedRun).toBe(false);
  });
});
