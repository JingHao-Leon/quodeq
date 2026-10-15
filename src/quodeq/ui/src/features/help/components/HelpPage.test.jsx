import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import HelpPage from './HelpPage.jsx';

// BrandCarousel auto-advances on a timer; stub it out for determinism.
vi.mock('../../../components/BrandCarousel.jsx', () => ({
  default: () => null,
}));

describe('HelpPage grade formula section', () => {
  it('lists Grade Formula in the section nav right after History & Trends', () => {
    render(<HelpPage />);
    const nav = screen.getByRole('button', { name: 'Grade Formula' });
    expect(nav.previousSibling).toHaveTextContent('History & Trends');
  });

  it('renders the Grade Formula section when selected', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Grade Formula' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Grade Formula' })).toBeInTheDocument();
    expect(screen.getByText('FORMULA')).toBeInTheDocument();
    expect(screen.getByText('TYPES')).toBeInTheDocument();
    expect(screen.getByText(/RESET Q²/)).toBeInTheDocument();
    expect(screen.queryByText('SEVERITY')).not.toBeInTheDocument();
  });
});

describe('HelpPage why this grade section', () => {
  it('is prose only and points at the editor for the live numbers', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Why This Grade' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Why This Grade' })).toBeInTheDocument();
    expect(screen.getByText(/shows these stages on your own run/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Principle')).not.toBeInTheDocument();
    expect(screen.queryByText(/Open a project with a finished run/)).not.toBeInTheDocument();
  });
});

describe('HelpPage history section', () => {
  it('documents day, week, month score grouping', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'History & Trends' }));
    expect(screen.getByRole('heading', { level: 3, name: /Group the Overview chart by day, week, or month/ })).toBeInTheDocument();
  });
});

describe('HelpPage providers section', () => {
  it('documents the omlx provider', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Providers' }));
    expect(screen.getByRole('heading', { level: 3, name: /omlx \(Apple Silicon only\)/ })).toBeInTheDocument();
  });

  it('documents the llama.cpp provider', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Providers' }));
    expect(screen.getByRole('heading', { level: 3, name: /llama\.cpp \(local, GGUF models\)/ })).toBeInTheDocument();
  });
});

describe('HelpPage settings section', () => {
  it('documents update notifications', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Updates' })).toBeInTheDocument();
    expect(screen.getByText(/QUODEQ_NO_UPDATE_NOTIFIER/)).toBeInTheDocument();
  });
});

describe('HelpPage overview section', () => {
  it('lists Overview in the section nav right after Running Evaluations', () => {
    render(<HelpPage />);
    const nav = screen.getByRole('button', { name: 'Overview' });
    expect(nav.previousSibling).toHaveTextContent('Running Evaluations');
  });

  it('documents accumulated scores and the report', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Accumulated scores' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'The report' })).toBeInTheDocument();
  });
});

describe('HelpPage command line section', () => {
  it('documents the CLI commands and PR review flow', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Command Line & CI' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Command Line & CI' })).toBeInTheDocument();
    expect(screen.getAllByText('quodeq review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('quodeq export sarif').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/--diff-from/).length).toBeGreaterThan(0);
  });
});

describe('HelpPage shared repository section', () => {
  it('lists Shared Repository in the section nav right after Repositories', () => {
    render(<HelpPage />);
    const nav = screen.getByRole('button', { name: 'Shared Repository' });
    expect(nav.previousSibling).toHaveTextContent('Repositories');
  });

  it('documents connect, publish, pull, and the cache override', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Shared Repository' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Shared Repository' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Publishing' })).toBeInTheDocument();
    expect(screen.getByText('pull local copy')).toBeInTheDocument();
    expect(screen.getByText(/QUODEQ_CACHE_ROOT/)).toBeInTheDocument();
  });

  it('cross-references sharing from the Repositories section', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Repositories' }));
    expect(screen.getByText('Publish / update')).toBeInTheDocument();
    expect(screen.getByText('Pull local copy')).toBeInTheDocument();
  });
});

describe('HelpPage violations section', () => {
  it('describes the workbench, not the old sub-tabs', () => {
    const { container } = render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Violations & Fix Plans' }));
    expect(screen.getByRole('heading', { level: 3, name: 'The workbench' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/sub-tab|by-dimension|by-file|Heatgrid/);
  });

  it('describes the scoped views: list and cards, Risk on folders and areas, the principle scope', () => {
    const { container } = render(<HelpPage initialSection="violations" />);
    expect(container.textContent).toMatch(/list\s+\(the default\)/);
    expect(container.textContent).toMatch(/on a folder or an area only/);
    expect(container.textContent).toMatch(/one principle/);
    expect(container.textContent).not.toMatch(/as a list ›/);
  });

  it('describes a principle\'s page: its requirements beside its findings, failing first, then Passing', () => {
    const { container } = render(<HelpPage initialSection="violations" />);
    expect(container.textContent).toMatch(/three columns: its requirements, its findings and the selected finding/);
    expect(container.textContent).toMatch(/how many of its requirements fail, of how many were checked/);
    expect(container.textContent).toMatch(/Passing/);
  });
});

describe('HelpPage deep link', () => {
  it('opens on the requested section', () => {
    render(<HelpPage initialSection="grade-formula" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Grade Formula' })).toBeInTheDocument();
  });

  it('falls back to philosophy on an unknown section', () => {
    render(<HelpPage initialSection="nope" />);
    expect(screen.getByRole('button', { name: 'Philosophy' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('HelpPage grade formula parameters', () => {
  it('documents every on-the-fly parameter', () => {
    render(<HelpPage initialSection="grade-formula" />);
    for (const name of ['Severity weights', 'Strictness K', 'Lift compress', 'Ceiling scale', 'Severity floors', 'Grade thresholds', 'Dimension weights']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });
});

describe('HelpPage overview header', () => {
  it('describes the header like a dimension page\'s: the ring, the sub line and the four tiles, and no since-baseline panel', () => {
    render(<HelpPage initialSection="overview" />);
    for (const name of ['Pass rate', 'Per 100 files', 'Critical per 1k', 'by which model']) {
      expect(screen.getAllByText(name, { exact: false }).length).toBeGreaterThan(0);
    }
    expect(screen.queryAllByText('Since baseline', { exact: false })).toHaveLength(0);
  });
});

describe('HelpPage violations by type', () => {
  it('documents dismissing a type behind the finding\'s menu', () => {
    render(<HelpPage initialSection="violations" />);
    expect(screen.getByRole('heading', { level: 3, name: /Dismissing a whole type/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Dismiss all/).length).toBeGreaterThan(0);
  });
});

describe('HelpPage overview: the dimension page', () => {
  it('reads the dimension page top to bottom: header, principles, history and radial, Fix first beside where', () => {
    const { container } = render(<HelpPage initialSection="overview" />);
    expect(screen.getByRole('heading', { level: 3, name: 'The dimension page' })).toBeInTheDocument();
    const text = container.textContent;
    const at = ['The header', 'one card per principle', 'Score history and principles radial', 'the dimension\'s requirements', 'its violations by file'].map((s) => text.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe('HelpPage overview: the tiles and the since line', () => {
  it('documents the tiles\' changes, the since line and the areas first, and no strip', () => {
    const { container } = render(<HelpPage initialSection="overview" />);
    expect(screen.queryByRole('heading', { level: 3, name: /The strip/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Since the previous period/ })).toBeInTheDocument();
    expect(container.textContent).toMatch(/change since the previous period/);
    expect(container.textContent).toMatch(/no new or fixed findings/);
    expect(container.textContent).toMatch(/per 100 files read/);
    expect(container.textContent).not.toMatch(/Open types|see findings/);
  });
});

describe('HelpPage history counts', () => {
  it('documents the tooltip counts and the MAJORS and TYPES columns, without lines, legend or a since-baseline panel', () => {
    const { container } = render(<HelpPage initialSection="history" />);
    expect((container.textContent.match(/majors/gi) || []).length).toBeGreaterThan(1);
    expect((container.textContent.match(/open types/gi) || []).length).toBeGreaterThan(1);
    expect(container.textContent).toMatch(/criticals/i);
    expect(screen.queryByRole('heading', { level: 3, name: /Since the baseline/ })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/legend|dashed|dotted|per-dimension lines/i);
  });

  it('describes the report order on the Overview page', () => {
    render(<HelpPage initialSection="overview" />);
    expect(screen.getByText(/report opens with the header's numbers/)).toBeInTheDocument();
  });
});

describe('HelpPage reading aids', () => {
  it('lists the section\'s subheadings under "on this page"', () => {
    render(<HelpPage initialSection="overview" />);
    const toc = screen.getByRole('navigation', { name: /on this page/i });
    expect(toc).toHaveTextContent('Accumulated scores');
    expect(toc).toHaveTextContent('The report');
  });

  it('moves to the next section from the pager', () => {
    render(<HelpPage initialSection="overview" />);
    fireEvent.click(screen.getByRole('button', { name: /next.*Compare/i }));
    expect(screen.getByRole('heading', { level: 2, name: 'Compare' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-current', 'page');
  });

  it('offers no previous link on the first section', () => {
    render(<HelpPage />);
    expect(screen.queryByRole('button', { name: /previous/i })).toBeNull();
    expect(screen.getByRole('button', { name: /next.*Getting Started/i })).toBeInTheDocument();
  });
});
