import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// The page composes the editor hook, the inputs query and the panels. Both
// hooks are mocked so the test controls draft/dirty/busy and the projects
// without touching the network, and asserts the page-level wiring.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../api/ApiContext.jsx';
import useGradeFormula from './useGradeFormula.js';
import { useFormulaInputs } from './hooks/useFormulaInputs.js';
import GradeFormulaPage from './GradeFormulaPage.jsx';
import { toPosition } from './knobs/knobScale.js';
import { GROUPS } from './knobs/knobGroups.js';

// The severity sliders are log-scaled: an input event carries a position, not a weight.
const majorAt = (weight) => String(toPosition(GROUPS[0].knobs.find((k) => k.id === 'major'), weight));

vi.mock('./useGradeFormula.js', () => ({ default: vi.fn() }));
vi.mock('./hooks/useFormulaInputs.js', () => ({ useFormulaInputs: vi.fn() }));
// The review sheet asks the server for its numbers; keep that pending.
vi.mock('../../api/index.js', async (importOriginal) => ({
  ...(await importOriginal()), previewGradeFormula: vi.fn(() => new Promise(() => {})),
}));

const THRESHOLDS = [[9, 'Exemplary'], [7, 'Good'], [5, 'Adequate'], [3, 'Poor']];

function baseDraft(overrides = {}) {
  return {
    severityWeight: { critical: 4, major: 2, minor: 0.25 },
    baseK: 0.08,
    liftCompress: 2.2,
    ceilScale: 0.5,
    floorMinor: 5,
    floorMajor: 3,
    gradeThresholds: THRESHOLDS,
    dimensionWeightsEnabled: false,
    dimensionWeights: { security: 1.2, maintainability: 1 },
    ...overrides,
  };
}

const principle = (id, major) => ({ id, massMinor: 1, massMajor: major, massCritical: 0, complianceMass: 3, observation: 1, worst: 'major' });
const INPUTS = { projects: [
  { id: 'a', dimensions: [{ dimension: 'security', frozenScore: null, principles: [principle('p1', 0.5)] }] },
  { id: 'b', dimensions: [{ dimension: 'security', frozenScore: null, principles: [principle('p2', 3)] }] },
] };
const NAVIGATION = { selectedProject: 'a', projects: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] };

function mockHook(over = {}) {
  const hookState = {
    saved: baseDraft(),
    draft: baseDraft(),
    defaults: baseDraft(),
    isCustom: false,
    isDirty: false,
    busy: false,
    error: null,
    partialNotice: null,
    rescoreProgress: null,
    update: vi.fn(),
    apply: vi.fn().mockResolvedValue(1),
    resetToDefaults: vi.fn().mockResolvedValue({ isCustom: false }),
    ...over,
  };
  useGradeFormula.mockReturnValue(hookState);
  useFormulaInputs.mockReturnValue({ inputs: INPUTS, loading: false, failed: false });
  return hookState;
}

function providers(api) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={client}><ApiProvider value={api}>{children}</ApiProvider></QueryClientProvider>
  );
}

function mount(ui, api = {}) {
  return render(ui, { wrapper: providers(api) });
}

describe('GradeFormulaPage', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('lists the input projects in the impact panel by their names', () => {
    mockHook();
    mount(<GradeFormulaPage navigation={NAVIGATION} />);
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Beta/ })).toBeInTheDocument();
  });

  it('moving the major slider sends the severity patch', () => {
    const state = mockHook();
    mount(<GradeFormulaPage navigation={NAVIGATION} />);
    fireEvent.change(screen.getByLabelText('major'), { target: { value: majorAt(3) } });
    expect(state.update).toHaveBeenCalledWith({ severityWeight: { critical: 4, major: 3, minor: 0.25 } });
  });

  it('Review and apply opens the review sheet; confirming applies and closes it', async () => {
    const state = mockHook({ isDirty: true, draft: baseDraft({ severityWeight: { critical: 4, major: 3, minor: 0.25 } }) });
    mount(<GradeFormulaPage navigation={NAVIGATION} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review and apply' }));
    expect(screen.getByRole('dialog', { name: 'Review changes before applying' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Apply/ }));
    expect(state.apply).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a failed apply keeps the sheet open and shows the error inside it', async () => {
    const state = mockHook({
      isDirty: true, draft: baseDraft({ severityWeight: { critical: 4, major: 3, minor: 0.25 } }),
      apply: vi.fn().mockResolvedValue(null), error: 'Apply failed',
    });
    mount(<GradeFormulaPage navigation={NAVIGATION} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review and apply' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply/ }));
    expect(state.apply).toHaveBeenCalledTimes(1);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Apply failed');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('counts a dimension weight edit as a changed setting', () => {
    mockHook({ isDirty: true, draft: baseDraft({ dimensionWeights: { security: 2, maintainability: 1 } }) });
    mount(<GradeFormulaPage navigation={NAVIGATION} />);
    expect(screen.getByText('1 setting changed')).toBeInTheDocument();
  });

  it('RESET Q² opens the reset sheet; confirming resets to the defaults', async () => {
    const state = mockHook({ isCustom: true });
    mount(<GradeFormulaPage navigation={NAVIGATION} />);
    fireEvent.click(screen.getByRole('button', { name: 'RESET Q²' }));
    expect(screen.getByRole('dialog', { name: 'Reset to Q² defaults' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Reset/ }));
    expect(state.resetToDefaults).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('hovering a project row dims the other projects\' dots', () => {
    mockHook();
    const { container } = mount(<GradeFormulaPage navigation={NAVIGATION} />);
    expect(container.querySelectorAll('.gf-dot--dim')).toHaveLength(0);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Alpha/ }));
    expect(container.querySelectorAll('.gf-dot--dim')).toHaveLength(1);
  });

  it('the TYPES tab lists the run types with the draft weight', async () => {
    mockHook({ draft: baseDraft({ severityWeight: { critical: 8, major: 3, minor: 1 } }) });
    const runDimensions = [{ dimension: 'security', violations: [{ req: 'S-INJ-1', principle: 'Input', file: 'a.py', line: 1, severity: 'major' }] }];
    mount(
      <GradeFormulaPage navigation={NAVIGATION} scope={{ project: 'a', runId: 'r1', dimensions: ['security'], dimension: null, runDimensions, selectedSource: null }} />,
      { getRunDiff: vi.fn(async () => ({ dimensions: {} })), getStandard: vi.fn(async () => ({ principles: [] })) },
    );
    fireEvent.click(screen.getByRole('tab', { name: 'TYPES' }));
    expect(await screen.findByText('S-INJ-1')).toBeInTheDocument();
    expect(screen.getByText('3.0')).toBeInTheDocument();
    expect(screen.getByText('no baseline')).toBeInTheDocument();
  });

  it('names a single project in the singular in the header', () => {
    mockHook();
    useFormulaInputs.mockReturnValue({ inputs: { projects: [INPUTS.projects[0]] }, loading: false, failed: false });
    mount(<GradeFormulaPage navigation={NAVIGATION} />);
    expect(screen.getByText(/^1 project · /)).toBeInTheDocument();
  });

  it('says when an older custom formula was set aside', () => {
    mockHook({ retiredCustom: true });
    mount(<GradeFormulaPage navigation={NAVIGATION} />);
    expect(screen.getByText(/older custom formula set aside/)).toBeInTheDocument();
  });

  it('shows a loading header until the draft arrives', () => {
    mockHook({ draft: null });
    mount(<GradeFormulaPage navigation={NAVIGATION} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  describe('while an apply or reset is in flight', () => {
    let rectSpy;

    beforeEach(() => {
      rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, right: 100, bottom: 28, width: 100, height: 28, x: 0, y: 0, toJSON: () => {},
      });
    });

    afterEach(() => { rectSpy.mockRestore(); });

    it('disables the sliders and the impact panel actions', () => {
      mockHook({ busy: true, isDirty: true });
      mount(<GradeFormulaPage navigation={NAVIGATION} />);
      expect(screen.getByLabelText('major')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Review and apply' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Undo all' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'RESET Q²' })).toBeDisabled();
    });

    it('blocks boundary-bar drags: update is not called', () => {
      const state = mockHook({ busy: true, isDirty: true });
      mount(<GradeFormulaPage navigation={NAVIGATION} />);
      fireEvent.pointerDown(screen.getByLabelText('Where Poor starts'), { clientX: 30 });
      fireEvent.pointerMove(window, { clientX: 70 });
      fireEvent.pointerUp(window);
      expect(state.update).not.toHaveBeenCalled();
    });

    it('a boundary-bar drag calls update once the request is done', () => {
      const state = mockHook({ busy: false });
      mount(<GradeFormulaPage navigation={NAVIGATION} />);
      fireEvent.pointerDown(screen.getByLabelText('Where Poor starts'), { clientX: 30 });
      fireEvent.pointerMove(window, { clientX: 50 });
      fireEvent.pointerUp(window);
      expect(state.update).toHaveBeenCalled();
    });
  });

  it('shows rescore progress in a live region', () => {
    mockHook({ rescoreProgress: { done: 2, total: 5 } });
    mount(<GradeFormulaPage navigation={NAVIGATION} />);
    expect(screen.getByRole('status')).toHaveTextContent('Rescoring 2 of 5 runs');
  });
});
