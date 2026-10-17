import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { notifyProviderSettingsChanged } from '../../../constants.js';
import useSettingsGroupStates from './useSettingsGroupStates.js';

const update = { status: { current: '1.13.1', update_available: false }, failed: false };

const theme = { mode: 'system', family: 'daruma' };

function fakeApi() {
  return {
    getAiClients: vi.fn(async () => ({ clients: [{ id: 'ollama', label: 'Ollama', installed: true }] })),
    getGithubAccount: vi.fn(async () => ({ signedIn: false, method: 'gh' })),
  };
}

describe('useSettingsGroupStates', () => {
  beforeEach(() => { localStorage.clear(); });

  it('names the default tab provider when none was chosen explicitly', async () => {
    const { result } = renderHook(() => useSettingsGroupStates({ providerConfigs: {}, theme, update }), { wrapper: withStableQueryApi(fakeApi()) });
    await waitFor(() => expect(result.current.evaluation.text).toBe('ollama · pick a model'));
  });

  it('follows a model chosen while the page is open', async () => {
    localStorage.setItem('cc-active-provider', 'claude');
    const { result } = renderHook(() => useSettingsGroupStates({ providerConfigs: {}, theme, update }), { wrapper: withStableQueryApi(fakeApi()) });
    act(() => {
      localStorage.setItem('cc-claude-model', 'sonnet');
      notifyProviderSettingsChanged();
    });
    await waitFor(() => expect(result.current.evaluation.text).toBe('claude · sonnet'));
  });

  it('reads connections, app and about from their sources', async () => {
    const { result } = renderHook(() => useSettingsGroupStates({ providerConfigs: {}, theme, update }), { wrapper: withStableQueryApi(fakeApi()) });
    await waitFor(() => expect(result.current.connections.text).toBe('using gh login'));
    expect(result.current.about.text).toBe('v1.13.1');
    expect(result.current.app.text).toBe('system · daruma');
    expect(result.current.assistant.text).toBe('uses the evaluation model');
  });
});
