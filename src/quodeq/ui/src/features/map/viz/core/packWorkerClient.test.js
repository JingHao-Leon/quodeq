import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requestPackLayout, requestTimelapseModel, resetPackWorker } from './packWorkerClient.js';

/** A stand-in Worker that answers each job with `reply(data)`, or throws on post like an uncloneable message. */
function stubWorker(reply) {
  globalThis.Worker = class {
    postMessage(data) {
      if (data.slim?.uncloneable) throw new Error('DataCloneError');
      queueMicrotask(() => this.onmessage({ data: reply(data) }));
    }

    terminate() {}
  };
}

afterEach(() => {
  resetPackWorker();
  delete globalThis.Worker;
});

test('a job the worker cannot take rejects, and the next job is still answered', async () => {
  stubWorker((data) => ({ id: data.id, xyr: Float32Array.of(1) }));
  await assert.rejects(requestPackLayout({ uncloneable: true }), /DataCloneError/);
  assert.deepEqual(await requestPackLayout({ v: 1 }), Float32Array.of(1));
});

test('a time-lapse model is named by the id of the message that carried it', async () => {
  stubWorker((data) => ({ id: data.id, xyr: Float32Array.of(data.id) }));
  const first = requestTimelapseModel({});
  const second = requestTimelapseModel({});
  assert.notEqual(first.modelId, second.modelId);
  assert.deepEqual(await first.anchor, Float32Array.of(first.modelId));
});
