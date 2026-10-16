import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import StandardsTable from './StandardsTable.jsx';
import { t } from '../../../strings/index.js';

vi.mock('../../../api/index.js', () => ({ exportStandard: vi.fn() }));

const T = '2026-10-14T10:00:00Z';
const row = (id, syncState, extra = {}) => ({ id, name: id, type: 'custom', principleCount: 1, requirementCount: 1, syncState, publishedAt: T, ...extra });
const actions = { onEdit: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), isVisible: () => true, onToggleVisibility: vi.fn() };
const sync = (over = {}) => ({ run: vi.fn(), pendingId: null, errors: {}, ...over });

function renderTable(customs, shared) {
  return render(<StandardsTable grouped={{ custom: customs }} actions={actions} shared={shared} />);
}

describe('StandardsTable sharing', () => {
  it('not connected: no sync column, no remote rows', () => {
    renderTable([row('a', undefined), row('go', 'remote_only', { remote: true })], undefined);
    expect(screen.queryByText(t('standards.colSync'))).toBeNull();
    expect(screen.queryByText('go')).toBeNull();
  });

  it('connected flag false: no sync cell and no sync actions', () => {
    const { container } = renderTable([row('a', 'changed')], { connected: false, sync: sync() });
    expect(container.querySelector('.standards-cell--sync')).toBeNull();
    expect(screen.queryByRole('button', { name: t('standards.syncPublish') })).toBeNull();
  });

  it('connected: header, cells and one action per state', () => {
    renderTable([row('pub', 'published'), row('chg', 'changed'), row('upd', 'update_available'), row('new', 'never_shared')],
      { connected: true, sync: sync() });
    expect(screen.getByText(t('standards.colSync'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('standards.syncPublish') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('standards.syncUpdate') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('standards.syncShare') })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^(share|publish|update|install)$/ })).toHaveLength(3);
  });

  it('diverged shows publish and update', () => {
    renderTable([row('div', 'diverged')], { connected: true, sync: sync() });
    expect(screen.getByRole('button', { name: t('standards.syncPublish') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('standards.syncUpdate') })).toBeInTheDocument();
  });

  it('remote-only row: install, no star, no toggle', () => {
    renderTable([row('go', 'remote_only', { remote: true })], { connected: true, sync: sync() });
    expect(screen.getByRole('button', { name: t('standards.syncInstall') })).toBeInTheDocument();
    expect(screen.queryByTitle(t('standards.enabledTitle'))).toBeNull();
    fireEvent.click(screen.getByText('go'));
    expect(actions.onToggleVisibility).not.toHaveBeenCalled();
  });

  it('clicking an action calls sync.run with the action and force', () => {
    const s = sync();
    renderTable([row('div', 'diverged')], { connected: true, sync: s });
    fireEvent.click(screen.getByRole('button', { name: t('standards.syncUpdate') }));
    expect(s.run).toHaveBeenCalledWith(expect.objectContaining({ id: 'div' }), { action: 'update', force: true });
    expect(actions.onToggleVisibility).not.toHaveBeenCalled();
  });

  it('a row error renders under that row only', () => {
    renderTable([row('a', 'changed'), row('b', 'changed')], { connected: true, sync: sync({ errors: { a: 'msg for a' } }) });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('msg for a');
  });

  it('pending row disables its action', () => {
    renderTable([row('a', 'changed')], { connected: true, sync: sync({ pendingId: 'a' }) });
    const btn = screen.getByRole('button', { name: t('standards.syncPending') });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });

  it('while one row syncs, every sync button is disabled', () => {
    renderTable([row('a', 'changed'), row('b', 'never_shared')], { connected: true, sync: sync({ pendingId: 'a' }) });
    const buttons = screen.getAllByRole('button', { name: /^(share|working…)$/ });
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => expect(b).toHaveAttribute('aria-disabled', 'true'));
  });

  it('a published or changed row without a publish time never prints null', () => {
    renderTable([row('a', 'published', { publishedAt: null }), row('b', 'changed', { publishedAt: null })], { connected: true, sync: sync() });
    expect(screen.getByText(t('standards.syncPublishedNoTime'))).toBeInTheDocument();
    expect(screen.getByText(t('standards.syncChangedNoTime'))).toBeInTheDocument();
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it('a remote-only row without a publish time reads remote only', () => {
    renderTable([row('go', 'remote_only', { remote: true, publishedAt: null })], { connected: true, sync: sync() });
    expect(screen.getByText(t('projects.remoteOnly'))).toBeInTheDocument();
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it('the sync cell carries the class the narrow layout hides', () => {
    const { container } = renderTable([row('a', 'published')], { connected: true, sync: sync() });
    expect(container.querySelector('.standards-row .standards-cell--sync')).not.toBeNull();
  });
});
