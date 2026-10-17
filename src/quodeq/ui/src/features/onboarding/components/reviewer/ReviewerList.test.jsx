import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { withStableQueryApi } from '../../../../test-utils/withQueryClient.jsx';
import { useReviewerChoice } from '../../hooks/useReviewerChoice.js';
import ReviewerList from './ReviewerList.jsx';

const CATALOG = [
  { id: 'opus', label: 'Opus', efforts: ['low', 'high'], defaultEffort: 'low', isDefault: false, pinned: false },
  { id: 'sonnet', label: 'Sonnet', efforts: ['low', 'high'], defaultEffort: 'low', isDefault: true, pinned: false },
];

const memoryStorage = () => ({ data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; }, removeItem(k) { delete this.data[k]; } });

function makeApi(getClientModels) {
  return {
    getClientModels: getClientModels || vi.fn().mockResolvedValue({ catalog: CATALOG }),
    getOllamaModels: vi.fn().mockResolvedValue([{ name: 'qwen3:8b' }]),
    getOllamaStatus: vi.fn().mockResolvedValue({ status: 'online' }),
  };
}

function Harness({ detected, onOpenSettings }) {
  const choice = useReviewerChoice({ detected, storage: memoryStorage() });
  return <ReviewerList detected={detected} choice={choice} onOpenSettings={onOpenSettings} />;
}

function renderList({ ids = ['claude-code', 'ollama'], getClientModels, onOpenSettings = vi.fn() } = {}) {
  const detected = ids.map((id) => ({ id, detected: true }));
  const Wrapper = withStableQueryApi(makeApi(getClientModels));
  render(<Wrapper><Harness detected={detected} onOpenSettings={onOpenSettings} /></Wrapper>);
  return { onOpenSettings };
}

describe('ReviewerList', () => {
  it('selected row shows model and effort fields, others a summary', async () => {
    renderList();
    expect(await screen.findByRole('option', { name: 'Sonnet (default)' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Effort' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Default (Low)' })).toBeInTheDocument();
    expect(screen.getByText('no model picked')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: 'Model' })).toHaveLength(1);
  });

  it('no row carries a recommended label', async () => {
    renderList({ ids: ['claude-code', 'codex-cli', 'ollama', 'openai'] });
    await screen.findByRole('option', { name: 'Sonnet (default)' });
    expect(screen.queryByText(/recommended/i)).toBeNull();
  });

  it('an unselected row summarises its model and default effort', async () => {
    renderList();
    await screen.findByRole('option', { name: 'Sonnet (default)' });
    fireEvent.click(screen.getByRole('radio', { name: 'Ollama' }));
    expect(await screen.findByText('Sonnet · default effort')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'qwen3:8b' })).toBeInTheDocument();
  });

  it('failed catalog shows the typed model id field', async () => {
    renderList({ getClientModels: vi.fn().mockResolvedValue({ error: 'down' }) });
    expect(await screen.findByPlaceholderText('Type model id')).toBeInTheDocument();
  });

  it('a cloud provider gets a model text field', () => {
    renderList({ ids: ['openai'] });
    expect(screen.getByPlaceholderText('Type model id')).toBeInTheDocument();
  });

  it('the footer opens settings for other providers', () => {
    const { onOpenSettings } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'other providers and api keys' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
