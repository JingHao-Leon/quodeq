import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStorage, getCleanStatus, putStorageSettings, getCleanPreview, startClean, deleteAllEvaluations,
} from './storage.js';

function okResponse(payload, status = 200) {
  return { ok: true, status, json: async () => payload };
}

describe('storage api', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('every call hits its route with its method', async () => {
    fetch.mockResolvedValue(okResponse({}));
    await getStorage();
    await getCleanStatus();
    await putStorageSettings({ archiveAfterDays: 365 });
    await getCleanPreview();
    await startClean();
    await deleteAllEvaluations();
    const calls = fetch.mock.calls.map(([u, i]) => `${i?.method || 'GET'} ${u.replace(/^.*\/api/, '')}`);
    expect(calls).toEqual([
      'GET /storage', 'GET /storage/clean', 'PUT /storage/settings',
      'GET /storage/preview', 'POST /storage/clean', 'DELETE /storage?confirm=true',
    ]);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ archiveAfterDays: 365 });
  });

  it('never sends null as a missing setting', async () => {
    fetch.mockResolvedValue(okResponse({ archiveAfterDays: null }));
    await putStorageSettings({ archiveAfterDays: null });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ archiveAfterDays: null });
  });

  it('a busy 409 keeps the blocking projects on the error', async () => {
    fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'busy', code: 'STORAGE_BUSY', projects: ['p1'] }) });
    const err = await deleteAllEvaluations().catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.body.projects).toEqual(['p1']);
  });
});
