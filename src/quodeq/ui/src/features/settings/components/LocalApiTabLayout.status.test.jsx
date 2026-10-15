import { describe, it, expect } from 'vitest';
import { rowStatus } from './LocalApiTabLayout.jsx';

describe('rowStatus', () => {
  it('reads a server status not answered yet as checking, not as down', () => {
    expect(rowStatus(null)).toBe('checking');
    expect(rowStatus(undefined)).toBe('checking');
  });

  it('passes an answered status through', () => {
    expect(rowStatus({ status: 'online' })).toBe('online');
    expect(rowStatus({ status: 'offline' })).toBe('offline');
  });
});
