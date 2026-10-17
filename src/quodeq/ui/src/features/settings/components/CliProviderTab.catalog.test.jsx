import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import CliProviderTab from './CliProviderTab.jsx';

const CATALOG = [
  { id: 'sol', label: 'GPT Sol', description: 'Workhorse', efforts: ['low', 'ultra'], defaultEffort: 'low', isDefault: true, pinned: false },
  { id: 'luna', label: 'GPT Luna', description: 'Small', efforts: [], defaultEffort: null, isDefault: false, pinned: false },
];

function renderTab({ state, update = vi.fn(), getClientModels }) {
  const api = { getClientModels: getClientModels || vi.fn().mockResolvedValue({ models: ['sol', 'luna'], catalog: CATALOG }) };
  const QueryWrapper = withQueryClient();
  render(
    <QueryWrapper>
      <ApiProvider value={api}>
        <CliProviderTab providerId="codex" providerConfig={{ effort_levels: ['low', 'high'] }} state={state} update={update} />
      </ApiProvider>
    </QueryWrapper>,
  );
  return { update, api };
}

describe('CliProviderTab with a live model catalog', () => {
  it('lists the account models, marks the recommended one and describes the selection', async () => {
    renderTab({ state: { model: 'sol' } });
    expect(await screen.findByRole('option', { name: 'GPT Sol (recommended)' })).toBeInTheDocument();
    expect(screen.getByText('Workhorse')).toBeInTheDocument();
  });

  it('offers the selected model\'s own efforts, naming its default', async () => {
    renderTab({ state: { model: 'sol' } });
    expect(await screen.findByRole('button', { name: 'Ultra' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Default (Low)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'High' })).toBeNull();
  });

  it('switching to a model without that effort drops it back to Default', async () => {
    const { update } = renderTab({ state: { model: 'sol', effort: 'ultra' } });
    await screen.findByRole('option', { name: 'GPT Luna' });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'luna' } });
    expect(update).toHaveBeenCalledWith('model', 'luna');
    expect(update).toHaveBeenCalledWith('effort', '');
  });

  it('keeps an unlisted saved id in the typed field', async () => {
    renderTab({ state: { model: 'my-finetune' } });
    expect(await screen.findByDisplayValue('my-finetune')).toBeInTheDocument();
  });

  it('falls back to typing when the CLI cannot list its models', async () => {
    renderTab({ state: { model: 'sol' }, getClientModels: vi.fn().mockResolvedValue({ models: [], error: 'down' }) });
    expect(await screen.findByText(/Could not list the models/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('sol')).toBeInTheDocument();
  });

  it('refresh asks the server to skip its cached list', async () => {
    const { api } = renderTab({ state: { model: 'sol' } });
    await screen.findByRole('option', { name: 'GPT Luna' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh the model list' }));
    expect(api.getClientModels).toHaveBeenLastCalledWith('codex', { refresh: true });
  });
});
