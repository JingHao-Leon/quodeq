import { createLayoutHandler } from './timelapseWorker.js';

const handle = createLayoutHandler();

self.onmessage = (event) => {
  const reply = handle(event.data);
  self.postMessage(reply, reply.xyr ? [reply.xyr.buffer] : []);
};
