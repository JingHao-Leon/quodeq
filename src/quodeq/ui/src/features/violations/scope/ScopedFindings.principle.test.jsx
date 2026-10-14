import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ScopedFindings from './ScopedFindings.jsx';
import { readScope } from './scopeModel.js';
import { SidePaneProvider } from '../../side-pane/index.js';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { t } from '../../../strings/index.js';

const deltas = vi.hoisted(() => ({ map: new Map(), args: null }));

vi.mock('../../../utils/pretext.js', async (importOriginal) => ({
  ...(await importOriginal()), measureWidth: () => 0, cssFontFromElement: () => '12px monospace',
}));
vi.mock('../../explorer/hooks/useStandardDescriptions.js', () => ({ useStandardDescriptions: () => ({ principleDescriptions: {} }) }));
vi.mock('../../../hooks/usePrinciplePeriodDeltas.js', () => ({
  usePrinciplePeriodDeltas: (args) => { deltas.args = args; return { principles: deltas.map, previous: null }; },
}));

const v = (over) => ({ file: 'src/app.py', dimension: 'security', principle: 'Input', ...over });
const DIMS = [{
  dimension: 'security', fromRunId: 'run-sec', filesRead: 50, principles: [{ name: 'Input', score: 7.7, grade: 'good' }],
  violations: [
    v({ line: 5, severity: 'critical', req: 'R2', title: 'Secret in code' }),
    v({ line: 9, severity: 'major', req: 'R1', title: 'Unchecked input' }),
    v({ line: 30, severity: 'minor', req: 'R1', title: 'Loose parse' }),
  ],
  compliance: [v({ line: 12, req: 'R3', title: 'Escaped output' }), v({ line: 14, req: 'R1', title: 'Checked form' })],
}];
const HISTORY = { project: 'p1', selectedSource: 'local', trend: [], granularity: 'week', runId: null };

function renderPrinciple() {
  return render(
    <SidePaneProvider>
      <ScopedFindings dims={DIMS} projectName="proj" dateLabel={null} onDismissFinding={vi.fn()} history={HISTORY}
        scope={readScope({ kind: 'principle', dimension: 'security', principle: 'Input' })} />
    </SidePaneProvider>,
    { wrapper: withQueryClient() },
  );
}

const rowTitles = (container) => [...container.querySelectorAll('.wb-row__t')].map((n) => n.textContent.replace('✓ ', ''));
const kindButtons = () => within(screen.getByRole('group', { name: t('violations.scopeKindAria') })).getAllByRole('button').map((b) => b.textContent);
const railItem = (container, id) => [...container.querySelectorAll('.req-rail__item')].find((n) => n.querySelector('.req-rail__id')?.textContent.endsWith(id));

describe('ScopedFindings, a principle', () => {
  beforeEach(() => { deltas.map = new Map(); });

  it('heads with its requirements failing of checked, in place of the per-file tiles', () => {
    renderPrinciple();
    const tile = screen.getByText(t('violations.scopeStatReqs')).closest('.findings-head__stat');
    expect(tile).toHaveTextContent(t('violations.scopeStatReqsValue', { failing: 2, total: 3 }));
    expect(screen.queryByText(t('violations.scopeStatCriticalK'))).toBeNull();
  });

  it('a requirement on the rail narrows the list and the kind counts; All brings them back', () => {
    const { container } = renderPrinciple();
    expect(rowTitles(container)).toEqual(['Secret in code', 'Unchecked input', 'Loose parse', 'Escaped output', 'Checked form']);
    fireEvent.click(railItem(container, 'R1'));
    expect(rowTitles(container)).toEqual(['Unchecked input', 'Loose parse', 'Checked form']);
    expect(kindButtons()).toEqual([t('violations.scopeKindAll'), 'major1', 'minor1', `${t('violations.scopeCompliantShort')}1`]);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('violations.scopeRailAll')) }));
    expect(rowTitles(container)).toHaveLength(5);
  });

  it('reads its change since the previous period from the history it is handed, hidden under 0.05', () => {
    deltas.map = new Map([['Input', 0.4]]);
    const { container, unmount } = renderPrinciple();
    expect(deltas.args).toMatchObject({ project: 'p1', granularity: 'week', dimension: 'security', activeRunId: 'run-sec' });
    expect(container.querySelector('.findings-head .trend-badge-delta')).toHaveTextContent('+0.4');
    unmount();
    deltas.map = new Map([['Input', 0.03]]);
    const again = renderPrinciple();
    expect(again.container.querySelector('.findings-head .trend-badge')).toBeNull();
  });
});
