import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import ExplorerPage from './ExplorerPage.jsx';

// The page's own-trend query needs a QueryClient; these render it bare.
vi.mock('./useExplorerTrend.js', () => ({ useExplorerTrend: (_p, _s, trend) => trend ?? [] }));
vi.mock('./explorerDataHooks.js', () => ({
  useExplorerData: () => ({ loading: true, evalData: null, allViolations: [] }),
  buildEvalPrincipalFn: () => () => ({}),
}));

vi.mock('../hooks/useStandardDescriptions.js', () => ({
  useStandardDescriptions: () => ({ standardDescription: '' }),
}));

vi.mock('../../side-pane/index.js', () => ({
  useRegisterWindowSpec: () => {},
  ReportContent: () => null,
}));

describe('ExplorerPage', () => {
  it('while data loads, paints the page in its final shape: the skeleton header under the dimension name', () => {
    const { container } = render(<ExplorerPage project="demo" dimension="Security" />);
    expect(container.querySelector('.overview-skeleton .findings-head .term-header__name')).toHaveTextContent('security');
  });

  it('while data loads, the skeleton cards stand for the principles, with no bare title over a loader', () => {
    const { container } = render(<ExplorerPage project="demo" dimension="security" />);
    expect(container.querySelector('.quality-dimensions')).toHaveTextContent(/principles/i);
    expect(container.querySelector('.loading-screen')).not.toBeInTheDocument();
  });
});
