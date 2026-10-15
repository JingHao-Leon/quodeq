import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { ServerLogContext } from '../server-log/ServerLogContext.js';
import ServerSection from './ServerSection.jsx';

const stubServerLog = { open: false, openLog: vi.fn(), closeLog: vi.fn() };

function makeWrapper() {
  const QueryWrapper = withQueryClient();
  return function Wrapper({ children }) {
    return (
      <QueryWrapper>
        <ServerLogContext.Provider value={stubServerLog}>{children}</ServerLogContext.Provider>
      </QueryWrapper>
    );
  };
}

describe('ServerSection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders online and shows server detail when /api/health responds', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, port: 7863, pid: 1234, version: '1.0.6', address: 'localhost:7863' }),
    });
    const Wrapper = makeWrapper();
    render(<Wrapper><ServerSection /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText('localhost:7863')).toBeTruthy();
      expect(screen.getByText('1.0.6')).toBeTruthy();
      expect(screen.getByText('1234')).toBeTruthy();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/health'), expect.any(Object));
  });

  it('renders offline when /api/health is unreachable', async () => {
    globalThis.fetch.mockRejectedValue(new Error('net down'));
    const Wrapper = makeWrapper();
    render(<Wrapper><ServerSection /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Not reachable');
    });
  });

  it('leaves PID out when the server does not report it', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, port: 7863, version: '1.13.1', address: 'localhost:7863' }),
    });
    const Wrapper = makeWrapper();
    render(<Wrapper><ServerSection /></Wrapper>);
    await waitFor(() => expect(screen.getByText('1.13.1')).toBeTruthy());
    expect(screen.queryByText('PID')).toBeNull();
  });
});
