import { it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolActivityGroup } from './ToolActivityGroup.jsx';

const done = (over) => ({ role: 'tool', kind: 'quodeq', status: 'ok', durationMs: 1200, ...over });

it('stays open while a call runs and names each step in plain words', () => {
  render(<ToolActivityGroup items={[
    done({ callId: 'c1', name: 'get_report', args: { dimension: 'maintainability' } }),
    { role: 'tool', callId: 'c2', name: 'get_violations', kind: 'quodeq', status: 'running', args: { path: 'feature-article' } },
  ]} />);
  expect(screen.getByRole('button', { expanded: true })).toHaveTextContent('Consulting the project · step 2');
  expect(screen.getByText('Reading the maintainability report')).toBeInTheDocument();
  expect(screen.getByText('Reading violations in feature-article')).toBeInTheDocument();
  expect(screen.getAllByText('1.2 s')).toHaveLength(2);
});

it('folds once every call settled, and a click pins it open again', () => {
  render(<ToolActivityGroup items={[
    done({ callId: 'c1', name: 'get_report', args: { dimension: 'security' } }),
    done({ callId: 'c2', name: 'search_findings', args: { query: 'auth' }, status: 'error', durationMs: 300 }),
  ]} />);
  const toggle = screen.getByRole('button', { expanded: false });
  expect(toggle).toHaveTextContent('Consulted the project · 2 steps');
  expect(toggle).toHaveTextContent('1 failed');
  expect(toggle).toHaveTextContent('1.5 s');
  expect(screen.queryByText('Reading the security report')).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
  expect(screen.getByText('Reading the security report')).toBeInTheDocument();
  expect(screen.getByText('Searching findings for “auth”')).toBeInTheDocument();
});

it('shows one preparing line for harness tools', () => {
  render(<ToolActivityGroup items={[{ role: 'tool', callId: 'h1', name: 'ToolSearch', kind: 'harness', status: 'running' }]} />);
  expect(screen.getByText('Preparing tools')).toBeInTheDocument();
});
