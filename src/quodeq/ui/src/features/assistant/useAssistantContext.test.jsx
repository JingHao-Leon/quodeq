import { it, expect, vi } from 'vitest';

vi.mock('../../hooks/useAppState.js', () => ({ default: () => ({}) }));  // not used directly; see note
vi.mock('../settings/hooks/useAssistantProvider.js', () => ({
  useAssistantProvider: () => ({ activeProvider: 'claude', model: 'sonnet' }),
}));
import { deriveAssistantContext, pageState } from './useAssistantContext.js';

it('derives provider/model/project/run/uiState from app + settings', () => {
  const appState = {
    activeTab: 'overview',
    selectedProject: 'selectives',
    selectedRun: 'run-9',
    currentOverviewRun: 'run-9',
    projects: [{ id: 'selectives', name: 'selectives-android', path: '/src/sa' }],
  };
  const gate = { activeProvider: 'claude', model: 'sonnet' };
  const ctx = deriveAssistantContext(appState, gate);
  expect(ctx).toEqual({
    provider: 'claude', model: 'sonnet',
    projectId: 'selectives', runId: 'run-9', source: 'local',
    uiState: {
      view: 'overview', activeTab: 'overview', selectedProject: 'selectives',
      selectedRun: 'run-9', currentOverviewRun: 'run-9',
    },
  });
});

it('includes view for the model even with no run selected', () => {
  const ctx = deriveAssistantContext(
    { activeTab: 'overview', selectedProject: 'selectives', projects: [] },
    { activeProvider: 'claude', model: 'sonnet' },
  );
  expect(ctx.uiState.view).toBe('overview');
  expect(ctx.uiState.currentOverviewRun).toBeUndefined();
});

it('does NOT bind runId on the overview: no explicit run → accumulated scope', () => {
  // The session stays run-unscoped on the overview so the detail tools read
  // the accumulated (per-dimension-latest) view. currentOverviewRun still
  // rides along in uiState for "this run" resolution, but must not scope.
  const ctx = deriveAssistantContext(
    { activeTab: 'overview', selectedProject: 'selectives', selectedRun: '', currentOverviewRun: 'r9', projects: [] },
    { activeProvider: 'claude', model: 'sonnet' },
  );
  expect(ctx.runId).toBeUndefined();
  expect(ctx.uiState.currentOverviewRun).toBe('r9');
});

it('binds runId only when a run is explicitly selected', () => {
  const ctx = deriveAssistantContext(
    { activeTab: 'overview', selectedProject: 'selectives', selectedRun: 'rX', currentOverviewRun: 'r9', projects: [] },
    { activeProvider: 'claude', model: 'sonnet' },
  );
  expect(ctx.runId).toBe('rX');
});

it('handles no selection gracefully', () => {
  const ctx = deriveAssistantContext({ activeTab: 'projects', projects: [] }, { activeProvider: 'ollama' });
  expect(ctx.projectId).toBeUndefined();
  expect(ctx.runId).toBeUndefined();
  expect(ctx.provider).toBe('ollama');
});

it('includes grouping and overviewDate when the overview granularity/dailyRuns resolve them', () => {
  const appState = {
    activeTab: 'overview',
    selectedProject: 'selectives',
    projects: [],
    granularity: 'week',
    dailyRuns: [{ dateLabel: 'Week of Jun 23, 2026' }, { dateLabel: 'Week of Jun 16, 2026' }],
    overviewRunIndex: 0,
  };
  const ctx = deriveAssistantContext(appState, { activeProvider: 'claude', model: 'sonnet' });
  expect(ctx.uiState.grouping).toBe('week');
  expect(ctx.uiState.overviewDate).toBe('Week of Jun 23, 2026');
});

it('includes dimension when the active page carries one', () => {
  const appState = {
    activeTab: 'violations',
    selectedProject: 'selectives',
    projects: [],
    activePage: { page: 'explorer', dimension: 'Security' },
  };
  const ctx = deriveAssistantContext(appState, { activeProvider: 'claude', model: 'sonnet' });
  expect(ctx.uiState.dimension).toBe('Security');
});

it('omits grouping, overviewDate and dimension when absent', () => {
  const appState = {
    activeTab: 'overview',
    selectedProject: 'selectives',
    projects: [],
  };
  const ctx = deriveAssistantContext(appState, { activeProvider: 'claude', model: 'sonnet' });
  expect('grouping' in ctx.uiState).toBe(false);
  expect('overviewDate' in ctx.uiState).toBe(false);
  expect('dimension' in ctx.uiState).toBe(false);
});

it('emits the selected source, defaulting to local', () => {
  const gate = { activeProvider: 'ollama', model: 'm' };
  expect(deriveAssistantContext({ selectedSource: 'shared' }, gate).source).toBe('shared');
  expect(deriveAssistantContext({ selectedSource: 'local' }, gate).source).toBe('local');
  expect(deriveAssistantContext({}, gate).source).toBe('local');
});

it('forwards the active page id and its scalar route params', () => {
  const appState = {
    activeTab: 'map',
    selectedProject: 'selectives',
    projects: [],
    activePage: { page: 'map', _tabKey: 3, path: 'feature-component-tracking', dimensions: ['security', 'clean-architecture'], vizStyle: 'pack' },
  };
  const ctx = deriveAssistantContext(appState, { activeProvider: 'claude', model: 'sonnet' });
  expect(ctx.uiState.page).toBe('map');
  expect(ctx.uiState.pageParams).toEqual({
    path: 'feature-component-tracking', dimensions: ['security', 'clean-architecture'], vizStyle: 'pack',
  });
});

it('keeps one level of object params and drops nested graphs and long strings', () => {
  const finding = {
    req: 'R-1', file: 'a.kt', line: 3, severity: 'major',
    snippet: 'x'.repeat(500),
    evidence: { nested: true },
    tags: ['a', { not: 'scalar' }, 'b'],
  };
  const state = pageState({ page: 'finding', finding, scope: { kind: 'folder', path: 'src', filter: { sev: 'major' } }, note: null });
  expect(state.page).toBe('finding');
  expect(state.pageParams.finding).toEqual({ req: 'R-1', file: 'a.kt', line: 3, severity: 'major', snippet: 'x'.repeat(200), tags: ['a', 'b'] });
  expect(state.pageParams.scope).toEqual({ kind: 'folder', path: 'src' });
  expect('note' in state.pageParams).toBe(false);
});

it('emits only the page when the entry has no usable params, and nothing without a page', () => {
  expect(pageState({ page: 'overview', _tabKey: 1 })).toEqual({ page: 'overview' });
  expect(pageState(undefined)).toEqual({});
  expect('page' in deriveAssistantContext({ activeTab: 'overview', projects: [] }, { activeProvider: 'ollama' }).uiState).toBe(false);
});

it('forwards the run picked in the History run log so "this run" resolves there', () => {
  const gate = { activeProvider: 'claude', model: 'm' };
  const picked = deriveAssistantContext({ activeTab: 'history', selectedProject: 'p', historySelectedRun: 'run-7' }, gate);
  expect(picked.uiState.historySelectedRun).toBe('run-7');
  const latest = deriveAssistantContext({ activeTab: 'history', selectedProject: 'p', historySelectedRun: 'latest' }, gate);
  expect(latest.uiState).not.toHaveProperty('historySelectedRun');
});
