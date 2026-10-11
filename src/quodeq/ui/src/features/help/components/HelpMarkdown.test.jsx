import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import HelpMarkdown from './HelpMarkdown.jsx';

describe('HelpMarkdown', () => {
  it('renders a Tip callout from a bold-titled blockquote', () => {
    const { container } = render(
      <HelpMarkdown source={'> **Heads up**\n>\n> Body text here.'} />,
    );
    expect(container.querySelector('.help-tip__title').textContent).toBe('Heads up');
    expect(container.querySelector('.help-tip__body').textContent).toContain('Body text here.');
  });

  it('renders a KeyTable from a GFM table, keyed and valued by column', () => {
    const { container } = render(
      <HelpMarkdown source={'| Key | Value |\n| --- | --- |\n| LOCAL | only here |'} />,
    );
    expect(container.querySelector('.help-keytable__k').textContent).toBe('LOCAL');
    expect(container.querySelector('.help-keytable__v').textContent).toBe('only here');
  });

  it('resolves a severity badge label from the catalog, not the markdown', () => {
    const { container } = render(<HelpMarkdown source={'Text `tag:critical` more.'} />);
    const badge = container.querySelector('.severity-tag.critical');
    expect(badge.textContent).toBe('CRITICAL');
  });

  // Registry lookups previously used a plain truthy check, so an inherited
  // Object.prototype key resolved to a function and was rendered as a
  // component -- crashing the page the fallback exists to protect.
  for (const inherited of ['toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
    it(`skips a figure named "${inherited}" instead of crashing`, () => {
      const src = ['```figure', `component: ${inherited}`, 'caption: x', '```'].join('\n');
      expect(() => render(<HelpMarkdown source={src} />)).not.toThrow();
    });

    it(`skips an icon named "${inherited}" instead of crashing`, () => {
      expect(() => render(<HelpMarkdown source={`a \`icon:${inherited}\` b`} />)).not.toThrow();
    });
  }

  it('still renders a known figure', () => {
    const src = ['```figure', 'component: ScoreGroupingFigure', 'caption: cap', '```'].join('\n');
    const { container } = render(<HelpMarkdown source={src} />);
    expect(container.querySelector('.sg-figure')).toBeTruthy();
  });

  // #6043 - HelpFigure wraps illustration children in
  // aria-hidden="true" by default, which suppressed GradeFormulaCurveFigure's
  // role="img"/aria-label from ever reaching a screen reader on the real Help
  // page. The registry now marks it informative so HelpFigure skips hiding it.
  it('keeps the grade-curve figure in the accessibility tree', () => {
    const src = ['```figure', 'component: GradeFormulaCurveFigure', 'caption: cap', '```'].join('\n');
    render(<HelpMarkdown source={src} />);
    expect(screen.getByRole('img', { name: /grade curve/i })).toBeInTheDocument();
  });

  it('still hides the decorative score-grouping figure from the accessibility tree', () => {
    const src = ['```figure', 'component: ScoreGroupingFigure', 'caption: cap', '```'].join('\n');
    render(<HelpMarkdown source={src} />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('turns a list whose items all lead with a bold term into a definition list', () => {
    const { container } = render(
      <HelpMarkdown source={'- **Score** the overall number.\n- **Ratio** violations to compliance.'} />,
    );
    const terms = [...container.querySelectorAll('dl.help-defs dt')].map((n) => n.textContent);
    const defs = [...container.querySelectorAll('dl.help-defs dd')].map((n) => n.textContent);
    expect(terms).toEqual(['Score', 'Ratio']);
    expect(defs).toEqual(['the overall number.', 'violations to compliance.']);
    expect(container.querySelector('ul')).toBeNull();
  });

  it('keeps a severity badge as the term of a definition row', () => {
    const { container } = render(<HelpMarkdown source={'- `tag:critical` a risk.\n- `tag:minor` a nit.'} />);
    expect(container.querySelector('dl.help-defs dt .severity-tag.critical')).toBeTruthy();
    expect(container.querySelectorAll('dl.help-defs dd')[1].textContent).toBe('a nit.');
  });

  it('leaves a list alone when any item does not lead with a term', () => {
    const { container } = render(<HelpMarkdown source={'- **Score** the number.\n- move to the **dismissed** tab'} />);
    expect(container.querySelector('dl')).toBeNull();
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
  });

  it('gives each subheading a stable id for the contents list', () => {
    render(<HelpMarkdown source={'## Title\n\n### Trust model & suppression rules'} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveAttribute('id', 'trust-model-suppression-rules');
  });

  it('marks the severity word at the start of a text sample line', () => {
    const { container } = render(<HelpMarkdown source={'```text\nCRITICAL    src/db.py:15\n            query\n```'} />);
    expect(container.querySelector('.help-pre .help-pre__sev.critical').textContent).toBe('CRITICAL');
    expect(container.querySelector('.help-pre').textContent).toBe('CRITICAL    src/db.py:15\n            query');
  });

  it('drops the colon that separates a term from its definition', () => {
    const { container } = render(<HelpMarkdown source={'- **Setup state**: resume it.\n- **Delta** since last run.'} />);
    expect(container.querySelector('dl.help-defs dd').textContent).toBe('resume it.');
  });

  it('keeps a list of sentences that merely open in bold as bullets', () => {
    const { container } = render(<HelpMarkdown source={'- **One session**, started at home.\n- **One window** at a time.'} />);
    expect(container.querySelector('dl')).toBeNull();
  });
});
