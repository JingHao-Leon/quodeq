import { it, expect, vi, afterEach } from 'vitest';
import { postWhenTurnSlotFree } from './useSessionActions.js';

afterEach(() => { vi.useRealTimers(); });

const busy = () => Object.assign(new Error('a turn is already running'), { code: 'TURN_IN_PROGRESS' });

it('retries while the server still holds the previous turn, then posts', async () => {
  vi.useFakeTimers();
  const post = vi.fn().mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockResolvedValue({ accepted: true });
  const done = postWhenTurnSlotFree(post);
  await vi.runAllTimersAsync();
  await expect(done).resolves.toEqual({ accepted: true });
  expect(post).toHaveBeenCalledTimes(3);
});

it('surfaces any other error at once, and gives up on a slot that never frees', async () => {
  vi.useFakeTimers();
  const other = vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { code: 'PROVIDER_BUSY' }));
  await expect(postWhenTurnSlotFree(other)).rejects.toThrow('nope');
  expect(other).toHaveBeenCalledTimes(1);
  const stuck = vi.fn().mockRejectedValue(busy());
  const done = postWhenTurnSlotFree(stuck);
  const settled = expect(done).rejects.toThrow('a turn is already running');
  await vi.runAllTimersAsync();
  await settled;
  expect(stuck).toHaveBeenCalledTimes(9);
});
