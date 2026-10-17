import { it, expect } from 'vitest';
import { preparePayload } from './useEvaluation.helpers.js';

function storageOf(entries) {
  const store = new Map(entries);
  return { getItem: (k) => (store.has(k) ? store.get(k) : null) };
}

it('never sends verifyFindings, even when an old verify=false is stored', () => {
  const storage = storageOf([['cc-active-provider', 'claude'], ['cc-claude-model', 'sonnet'], ['cc-claude-verify', 'false']]);
  const result = preparePayload({ projectPath: '/p' }, storage);
  expect(result).not.toHaveProperty('verifyFindings');
});

it('sends the stored effort for the payload provider', () => {
  const storage = storageOf([['cc-active-provider', 'claude'], ['cc-claude-model', 'sonnet'], ['cc-claude-effort', 'high']]);
  expect(preparePayload({ projectPath: '/p' }, storage)).toEqual(expect.objectContaining({ aiEffort: 'high' }));
});

it('leaves effort out when none is stored, so the CLI keeps its default', () => {
  const storage = storageOf([['cc-active-provider', 'claude'], ['cc-claude-model', 'sonnet']]);
  expect(preparePayload({ projectPath: '/p' }, storage)).not.toHaveProperty('aiEffort');
});
