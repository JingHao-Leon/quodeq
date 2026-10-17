import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { invalidateDimensionCache } from '../hooks/usePluginDimensions.js';
import { makeFakeApi, renderCard } from './_reEvaluateCard.fixtures.jsx';

const INFO = { name: 'demo', path: '/repos/myproj', location: 'local', ephemeral: false, evaluable: true };
const CATALOG = [
  { id: 'opus', label: 'Opus', efforts: ['low', 'high'], defaultEffort: 'low', isDefault: false },
  { id: 'sonnet', label: 'Sonnet', efforts: ['low', 'high'], defaultEffort: 'low', isDefault: true },
];
const CLIENTS = [
  { id: 'ollama', label: 'Ollama', installed: true },
  { id: 'codex', label: 'Codex CLI', installed: false },
  { id: 'claude', label: 'Claude Code', installed: true },
];
const TITLE = 'Who reviews this run';

function setup() {
  const onStart = vi.fn();
  const onGoToSettings = vi.fn();
  const api = makeFakeApi({
    getProjectInfo: vi.fn().mockResolvedValue(INFO),
    listPlugins: vi.fn().mockResolvedValue([{ dimensions: [{ id: 'security', label: 'Security' }] }]),
    getAiClients: vi.fn().mockResolvedValue({ clients: CLIENTS }),
    getClientModels: vi.fn().mockResolvedValue({ catalog: CATALOG }),
    getOllamaModels: vi.fn().mockResolvedValue([{ name: 'qwen3:8b' }]),
    getOllamaStatus: vi.fn().mockResolvedValue({ status: 'online' }),
  });
  renderCard({ project: 'p-popover', projectInfo: INFO, api, onStart, onGoToSettings, preselectDims: ['security'] });
  return { onStart, onGoToSettings };
}

async function openPopover() {
  fireEvent.click(await screen.findByRole('button', { name: 'choose model' }));
  return screen.findByRole('dialog', { name: TITLE });
}

describe('ModelPopover on Evaluate', () => {
  beforeEach(() => { invalidateDimensionCache(); localStorage.clear(); });

  it('model cell opens the popover, not settings', async () => {
    const { onGoToSettings } = setup();
    const dialog = await openPopover();
    expect(dialog).toHaveFocus();
    expect(onGoToSettings).not.toHaveBeenCalled();
    expect(await screen.findByRole('tab', { name: 'Claude Code' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Codex CLI' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('lists providers in the neutral order', async () => {
    setup();
    await openPopover();
    await screen.findByRole('tab', { name: 'Claude Code' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Claude Code', 'Codex CLI', 'Ollama']);
  });

  it('use writes the choice and closes', async () => {
    setup();
    await openPopover();
    fireEvent.click(await screen.findByRole('button', { name: 'use Sonnet' }));
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
    expect(localStorage.getItem('cc-active-provider')).toBe('claude');
    expect(localStorage.getItem('cc-claude-model')).toBe('sonnet');
    const cell = screen.getByRole('button', { name: /claude.*sonnet/ });
    expect(cell).toHaveTextContent('claude · sonnet · default effort');
    expect(cell).toHaveFocus();
    expect(cell.closest('.eval-identity__cell')).not.toHaveClass('eval-identity__cell--attention');
  });

  it('shows the chosen effort in the model cell', async () => {
    localStorage.setItem('cc-active-provider', 'claude');
    localStorage.setItem('cc-claude-model', 'opus');
    localStorage.setItem('cc-claude-effort', 'high');
    setup();
    expect(await screen.findByRole('button', { name: /claude.*opus/ })).toHaveTextContent('claude · opus · high effort');
  });

  it('all model settings navigates to settings', async () => {
    const { onGoToSettings } = setup();
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'all model settings' }));
    expect(onGoToSettings).toHaveBeenCalledTimes(1);
  });

  it('esc closes without writing', async () => {
    setup();
    await openPopover();
    await screen.findByRole('button', { name: 'use Sonnet' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
    expect(localStorage.getItem('cc-active-provider')).toBeNull();
    expect(screen.getByRole('button', { name: 'choose model' })).toHaveFocus();
  });

  it('an outside click closes without writing', async () => {
    setup();
    await openPopover();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
    expect(localStorage.getItem('cc-claude-model')).toBeNull();
  });

  it('switching provider shows that provider choice, nothing is written', async () => {
    localStorage.setItem('cc-ollama-model', 'qwen3:8b');
    setup();
    await openPopover();
    fireEvent.click(await screen.findByRole('tab', { name: 'Ollama' }));
    expect(await screen.findByRole('button', { name: 'use qwen3:8b' })).toBeInTheDocument();
    expect(localStorage.getItem('cc-active-provider')).toBeNull();
  });

  it('popover never starts a scan', async () => {
    const { onStart } = setup();
    await openPopover();
    fireEvent.click(await screen.findByRole('button', { name: 'use Sonnet' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull());
    expect(onStart).not.toHaveBeenCalled();
  });
});
