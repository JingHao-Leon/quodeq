import { handlePackMessage } from './packLayout.js';
import { createTimelapseHandler } from './timelapseWorker.js';

const timelapse = createTimelapseHandler();

self.onmessage = (event) => {
  const reply = event.data.type ? timelapse(event.data) : handlePackMessage(event.data);
  self.postMessage(reply, reply.xyr ? [reply.xyr.buffer] : []);
};
