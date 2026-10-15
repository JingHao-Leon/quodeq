import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import PageToolbar from './PageToolbar.jsx';

describe('PageToolbar', () => {
  it('puts the facts on the left and the controls on the right, with no title', () => {
    const { container } = render(
      <PageToolbar facts="3 open · 1 crit"><button type="button">import</button></PageToolbar>,
    );
    expect(container.querySelector('.page-toolbar__facts')).toHaveTextContent('3 open · 1 crit');
    expect(container.querySelector('.page-toolbar__controls')).toContainElement(screen.getByRole('button', { name: 'import' }));
    expect(container.querySelector('.term-header')).toBeNull();
  });

  it('leaves the controls slot out when the page has no controls', () => {
    const { container } = render(<PageToolbar facts="2 runs" />);
    expect(container.querySelector('.page-toolbar__controls')).toBeNull();
  });

  it('shows the subject before the facts, and the badge after them', () => {
    const { container } = render(<PageToolbar subject="security" facts="5 principles" badge={<span>remote</span>} />);
    expect(container.querySelector('.page-toolbar__facts')).toHaveTextContent(/^security5 principlesremote$/);
    expect(container.querySelector('.page-toolbar__subject')).toHaveTextContent('security');
  });

  it('adds the page hook class beside its own', () => {
    const { container } = render(<PageToolbar className="rl-top" facts="1 run" />);
    expect(container.firstChild).toHaveClass('page-toolbar', 'rl-top');
  });
});
