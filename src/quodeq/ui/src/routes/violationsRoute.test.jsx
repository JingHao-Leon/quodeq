import { describe, it, expect, vi } from 'vitest';
import { PROJECT_SOURCE } from '../vocab/projectSource.js';
import { NAV_TAB } from '../vocab/navTab.js';
import { ViolationsRoute, buildEvalPrincipal } from './violationsRoute.jsx';

function dims() {
  return [
    { dimension: 'security', fromRunId: 'run-1', principles: [{ name: 'P1', grade: 'B', score: '7.5' }] },
    { dimension: 'perf', fromRunId: 'run-2', principles: [{ principle: 'P2', grade: 'C' }] },
  ];
}

function routeProps(acc) {
  return {
    dashboardData: { latestAccumulated: acc, accumulated: null, selectedDisplayName: 'p1', loading: false, isFetching: false },
    navigation: { selectedProject: 'proj1', selectedSource: 'local', projects: [], projectsLoaded: true, handleNavigate: vi.fn(), navStackLength: 1 },
    refreshDashboard: vi.fn(),
    scheduleDashboardReconcile: vi.fn(),
  };
}

describe('ViolationsRoute', () => {
  it('stays hook-free: callable as a plain function across re-renders', () => {
    const props = routeProps({ dimensions: dims() });
    // Invoked twice with the same payload, as a parent state bump would; the
    // App tests rely on this being callable as a plain function.
    ViolationsRoute({ params: {}, props });
    const el = ViolationsRoute({ params: {}, props });
    expect(el.props.data.accumulatedDimensions).toHaveLength(2);
  });

  it('renders with no accumulated payload', () => {
    const el = ViolationsRoute({ params: {}, props: routeProps(null) });
    expect(el.props.data.accumulatedDimensions).toEqual([]);
  });

  it('passes the workbench param through and replaces the entry on change', () => {
    const props = routeProps({ dimensions: dims() });
    props.navigation.handleNavigateReplace = vi.fn();
    const el = ViolationsRoute({ params: { wb: { q: 'api' } }, props });
    expect(el.props.workbench).toEqual({ q: 'api' });
    el.props.onWorkbenchChange({ q: 'x' });
    expect(props.navigation.handleNavigateReplace).toHaveBeenCalledWith(NAV_TAB.VIOLATIONS, { wb: { q: 'x' } });
  });

  it('offers a finding dismiss for a local project only', () => {
    const local = ViolationsRoute({ params: {}, props: routeProps({ dimensions: dims() }) });
    expect(typeof local.props.callbacks.onDismissFinding).toBe('function');
    const sharedProps = routeProps({ dimensions: dims() });
    sharedProps.navigation.selectedSource = PROJECT_SOURCE.SHARED;
    const shared = ViolationsRoute({ params: {}, props: sharedProps });
    expect(shared.props.callbacks.onDismissFinding).toBeUndefined();
  });
});

describe('ViolationsRoute as of a past day', () => {
  it('is read-only and goes back to today on the same entry', () => {
    const props = routeProps({ dimensions: dims() });
    props.navigation.handleNavigateReplace = vi.fn();
    const params = { wb: { q: 'api' }, asOf: { runId: 'r7', day: '2026-08-07' } };
    const el = ViolationsRoute({ params, props });
    expect(el.props.data.asOf).toEqual({ runId: 'r7', day: '2026-08-07' });
    expect(el.props.callbacks.onDismissFinding).toBeUndefined();
    el.props.callbacks.onBackToToday();
    expect(props.navigation.handleNavigateReplace).toHaveBeenCalledWith(NAV_TAB.VIOLATIONS, { wb: { q: 'api' }, asOf: null });
  });
});

describe('buildEvalPrincipal', () => {
  it('keeps a genuine score of 0, not coercing it to null', () => {
    const result = buildEvalPrincipal({ principle: 'P1', dimension: 'security' }, { score: 0, grade: 'F' }, 'run-1');
    expect(result.score).toBe(0);
  });
});
