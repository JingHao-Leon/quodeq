import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RunFindings from './RunFindings.jsx';

const f = (dimension, severity, title) => ({ dimension, severity, title, principle: 'P', file: 'a.py', line: 1 });

describe('RunFindings', () => {
  it('names each severity once per group, in its colour', () => {
    render(<RunFindings list={[f('security', 'major', 'x'), f('security', 'major', 'y'), f('security', 'minor', 'z')]} onOpen={vi.fn()} />);
    expect(screen.getByText(/2 maj/)).toHaveClass('rl-sevword--major');
    expect(screen.getByText(/1 min/)).toHaveClass('rl-sevword--minor');
  });

  it('marks each row with the severity edge, no badge', () => {
    const { container } = render(<RunFindings list={[f('security', 'critical', 'x')]} onOpen={vi.fn()} />);
    expect(screen.getByText('x').closest('.rl-frow__t')).toHaveClass('rl-frow__t--critical');
    expect(container.querySelector('.term-sev-badge')).toBeNull();
  });

  it('one group per dimension even when the list interleaves them (severity order)', () => {
    const list = [f('usability', 'major', 'u1'), f('security', 'major', 's1'), f('usability', 'minor', 'u2')];
    const { container } = render(<RunFindings list={list} onOpen={vi.fn()} />);
    const heads = [...container.querySelectorAll('.rl-fgroup__dim')].map((n) => n.textContent);
    expect(heads).toHaveLength(2);
    expect(heads[0]).toMatch(/^usability/);
  });

  it('leaves nothing behind when the list changes', () => {
    const list = [f('usability', 'major', 'u1'), f('security', 'major', 's1'), f('usability', 'minor', 'u2')];
    const { container, rerender } = render(<RunFindings list={list} onOpen={vi.fn()} />);
    rerender(<RunFindings list={[f('security', 'minor', 's9')]} onOpen={vi.fn()} />);
    expect(container.querySelectorAll('.rl-fgroup')).toHaveLength(1);
    expect(screen.queryByText('u1')).toBeNull();
  });
});

