import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import NotEvaluatedLine from './NotEvaluatedLine.jsx';
import { t } from '../../../strings/index.js';

describe('NotEvaluatedLine', () => {
  it('names the standards switched on without results and opens Evaluate', () => {
    const onEvaluate = vi.fn();
    render(<NotEvaluatedLine ids={['android-kotlin', 'flutter-widgets']} onEvaluate={onEvaluate} />);
    expect(screen.getByRole('note')).toHaveTextContent('android kotlin, flutter widgets');
    fireEvent.click(screen.getByRole('button', { name: t('overview.notEvaluatedEvaluate') }));
    expect(onEvaluate).toHaveBeenCalledTimes(1);
  });

  it('shortens a long list to three names and a count', () => {
    render(<NotEvaluatedLine ids={['a', 'b', 'c', 'd', 'e']} onEvaluate={vi.fn()} />);
    expect(screen.getByRole('note')).toHaveTextContent('a, b, c and 2 more');
  });

  it('renders nothing when every standard has results', () => {
    const { container } = render(<NotEvaluatedLine ids={[]} onEvaluate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
