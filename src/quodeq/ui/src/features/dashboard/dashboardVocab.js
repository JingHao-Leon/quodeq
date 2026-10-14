// The global publish job's state machine, mirrored by the backend's own
// publish/status payload (services/shared_publish.py's PublishState; the
// parity test is tests/tools/test_vocab_mirrors_match_ui.py).
export const PUBLISH_STATE = Object.freeze({
  IDLE: 'idle', RUNNING: 'running', DONE: 'done', ERROR: 'error',
});

// The overview hero's clickable stat cards, shared with the dimension page (vocab/heroCardKind.js).
export { HERO_CARD_KIND } from '../../vocab/heroCardKind.js';

// deriveAction's verdict for a merged local/shared project entry
// (projectsMerge.js): what the card's action button should offer. null
// means no action needed.
export const PROJECT_ACTION = Object.freeze({ PUBLISH: 'publish', UPDATE: 'update', PULL: 'pull' });
