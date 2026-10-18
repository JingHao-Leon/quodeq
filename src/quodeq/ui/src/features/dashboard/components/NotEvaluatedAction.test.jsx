import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import NotEvaluatedAction from './NotEvaluatedAction.jsx';

describe('NotEvaluatedAction', () => {
  it('counts the standards switched on without results, names them, and opens Evaluate', () => {
    const onEvaluate = vi.fn();
    render(<NotEvaluatedAction ids={['android-kotlin', 'flutter-widgets']} onEvaluate={onEvaluate} />);
    const button = screen.getByRole('button', { name: /android kotlin, flutter widgets/ });
    expect(button).toHaveTextContent('2 not evaluated');
    expect(button).toHaveAttribute('title', expect.stringContaining('android kotlin, flutter widgets'));
    fireEvent.click(button);
    expect(onEvaluate).toHaveBeenCalledTimes(1);
  });

  it('shortens a long list to three names and a count', () => {
    render(<NotEvaluatedAction ids={['a', 'b', 'c', 'd', 'e']} onEvaluate={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('title', expect.stringContaining('a, b, c and 2 more'));
  });

  it('renders nothing when every standard has results', () => {
    const { container } = render(<NotEvaluatedAction ids={[]} onEvaluate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
