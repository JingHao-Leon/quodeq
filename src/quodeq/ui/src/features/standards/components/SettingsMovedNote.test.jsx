import { afterEach, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsMovedNote } from './SettingsMovedNote.jsx';

afterEach(() => localStorage.clear());

it('shows only when the server migrated, and stays dismissed per project', () => {
  const { container, rerender } = render(<SettingsMovedNote projectId="p1" migratedFrom={null} />);
  expect(container.firstChild).toBeNull();
  rerender(<SettingsMovedNote projectId="p1" migratedFrom="/repo/a" />);
  expect(screen.getByRole('status').textContent).toContain('/repo/a');
  fireEvent.click(screen.getByRole('button'));
  expect(screen.queryByRole('status')).toBeNull();
  rerender(<SettingsMovedNote projectId="p2" migratedFrom="/repo/b" />);
  expect(screen.getByRole('status')).toBeTruthy();
});
