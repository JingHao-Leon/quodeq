import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CompareDimensionView from './CompareDimensionView.jsx';
import { buildRow, buildDimensionView } from '../compareModel.js';
import { NOW, makeSummary, makeProject, DIM_SEC, DIM_USE } from '../_compareModel.fixtures.js';

const board = [
  { key: 'security', label: 'Security' },
  { key: 'usability', label: 'Usability' },
];

// Three principles, because the radar panel only draws a polygon at 3+ and
// the test asserts the panel really wraps the whole dimension body.
const secDim = (score) => ({
  ...DIM_SEC(score),
  principles: [
    { principle: 'Integrity', score: `${score}` },
    { principle: 'Confidentiality', score: `${score - 1}` },
    { principle: 'Authenticity', score: `${score - 2}` },
  ],
});

function makeView(dim = secDim) {
  const summaries = {
    a: makeSummary({ dims: [dim(6), DIM_USE(8)] }),
    b: makeSummary({ dims: [dim(8), DIM_USE(5)] }),
  };
  const rows = ['a', 'b'].map((id) => buildRow(makeProject({ id }), summaries[id], NOW));
  return buildDimensionView('security', rows, NOW, summaries);
}

const renderView = (dim) => render(
  <CompareDimensionView
    view={makeView(dim)}
    board={board}
    fleet={null}
    onOpenDimension={vi.fn()}
    onOpenProject={vi.fn()}
    onOpenPrinciple={vi.fn()}
    onOpenProjectDimension={vi.fn()}
  />,
);

describe('CompareDimensionView accessibility (#6521)', () => {
  it('heads the page with the dimension switcher naming the open dimension', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Switch dimension, Security is open' })).toBeInTheDocument();
  });

  it('contains the radar chart for the dimension', () => {
    renderView();
    expect(screen.getByRole('img', { name: /Radar chart/ })).toBeInTheDocument();
  });

  it('under three principles leaves the radar out and the projects table takes the row', () => {
    const { container } = renderView((score) => ({ ...secDim(score), principles: secDim(score).principles.slice(0, 2) }));
    expect(screen.queryByRole('img', { name: /Radar chart/ })).toBeNull();
    expect(container.querySelector('.compare-dim__pair')).toHaveClass('compare-dim__pair--single');
  });
});
