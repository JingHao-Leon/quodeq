import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { useReviewerChoice } from './useReviewerChoice.js';

const CATALOG = [
  { id: 'opus', label: 'Opus', efforts: ['low', 'high'], defaultEffort: 'low', isDefault: false, pinned: false },
  { id: 'sonnet', label: 'Sonnet', efforts: ['low', 'high'], defaultEffort: 'low', isDefault: true, pinned: false },
];

const fakeStorage = (entries = {}) => ({
  data: { ...entries },
  getItem(key) { return key in this.data ? this.data[key] : null; },
  setItem(key, value) { this.data[key] = String(value); },
  removeItem(key) { delete this.data[key]; },
});

const api = () => ({ getClientModels: vi.fn().mockResolvedValue({ catalog: CATALOG }) });
const detectedOf = (...ids) => ids.map((id) => ({ id, detected: true }));

function renderChoice(detected, storage = fakeStorage()) {
  return renderHook(() => useReviewerChoice({ detected, storage }), { wrapper: withStableQueryApi(api()) });
}

describe('useReviewerChoice', () => {
  it('first selection follows the neutral order, not the preselection ranking', () => {
    const { result } = renderChoice(detectedOf('ollama', 'codex-cli', 'claude-code'));
    expect(result.current.providerId).toBe('claude');
  });

  it('catalog default pre-selected for claude', async () => {
    const { result } = renderChoice(detectedOf('claude-code'));
    await waitFor(() => expect(result.current.model).toBe('sonnet'));
    expect(result.current.effort).toBe('');
    expect(result.current.ready).toBe(true);
  });

  it('ollama starts with no model and ready is false', () => {
    const { result } = renderChoice(detectedOf('ollama'));
    expect(result.current.providerId).toBe('ollama');
    expect(result.current.model).toBeNull();
    expect(result.current.ready).toBe(false);
  });

  it('switching provider and back keeps the chosen model', async () => {
    const { result } = renderChoice(detectedOf('claude-code', 'ollama'));
    await waitFor(() => expect(result.current.model).toBe('sonnet'));
    act(() => result.current.setModel('opus'));
    act(() => result.current.select('ollama'));
    expect(result.current.model).toBeNull();
    act(() => result.current.select('claude'));
    expect(result.current.model).toBe('opus');
  });

  it('a model change drops an effort the new model does not take', async () => {
    const { result } = renderChoice(detectedOf('claude-code'));
    await waitFor(() => expect(result.current.model).toBe('sonnet'));
    act(() => result.current.setEffort('high'));
    act(() => result.current.setModel('my-finetune'));
    expect(result.current.effort).toBe('');
  });

  it('save writes the choice under the server id', async () => {
    const storage = fakeStorage();
    const { result } = renderChoice(detectedOf('claude-code'), storage);
    await waitFor(() => expect(result.current.model).toBe('sonnet'));
    act(() => result.current.setEffort('high'));
    act(() => result.current.save());
    expect(storage.data).toEqual({ 'cc-active-provider': 'claude', 'cc-claude-model': 'sonnet', 'cc-claude-effort': 'high' });
  });

  it('a stored model wins over the catalog default', async () => {
    const { result } = renderChoice(detectedOf('claude-code'), fakeStorage({ 'cc-claude-model': 'opus' }));
    await waitFor(() => expect(result.current.model).toBe('opus'));
  });

  it('a returning user starts on the stored active provider when it is detected', () => {
    const { result } = renderChoice(detectedOf('claude-code', 'codex-cli'), fakeStorage({ 'cc-active-provider': 'codex' }));
    expect(result.current.providerId).toBe('codex');
    expect(result.current.changed).toBe(false);
  });

  it('a stored active provider that was not detected falls back to the neutral first', () => {
    const { result } = renderChoice(detectedOf('ollama', 'claude-code'), fakeStorage({ 'cc-active-provider': 'gemini' }));
    expect(result.current.providerId).toBe('claude');
  });

  it('a model picked on the stored provider counts as a change', async () => {
    const { result } = renderChoice(detectedOf('claude-code'), fakeStorage({ 'cc-active-provider': 'claude' }));
    await waitFor(() => expect(result.current.model).toBe('sonnet'));
    expect(result.current.changed).toBe(false);
    act(() => result.current.setModel('opus'));
    expect(result.current.changed).toBe(true);
  });

  it('a first reviewer (nothing stored) counts as a change', () => {
    const { result } = renderChoice(detectedOf('claude-code'));
    expect(result.current.changed).toBe(true);
  });
});
