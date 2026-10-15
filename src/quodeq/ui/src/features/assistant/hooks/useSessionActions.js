import { useCallback } from 'react';
import { useApi } from '../../../api/ApiContext.jsx';
import { t } from '../../../strings/index.js';
import { MESSAGE_ROLE } from '../messageRole.js';

// The server emits a turn's `done` frame a moment before its worker frees the
// session's turn slot, so a message sent the instant a turn ends (a queued
// one) can meet a 409 with this code. It is retried briefly, never surfaced.
const TURN_IN_PROGRESS_CODE = 'TURN_IN_PROGRESS';
const TURN_SLOT_RETRIES = 8;
const TURN_SLOT_RETRY_MS = 250; // eight tries cover two seconds

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Run *post*, retrying while the server answers TURN_IN_PROGRESS (the
 * previous turn has sent `done` but not yet freed its slot). Any other error,
 * or a slot still held after the last retry, rejects as is.
 * @param {() => Promise<any>} post
 * @returns {Promise<any>}
 */
export async function postWhenTurnSlotFree(post) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await post();
    } catch (err) {
      if (err?.code !== TURN_IN_PROGRESS_CODE || attempt >= TURN_SLOT_RETRIES) throw err;
      await sleep(TURN_SLOT_RETRY_MS);
    }
  }
}

/**
 * Assistant session actions: send a message, stop the in-flight turn, and
 * record a client-answered local exchange. useSessionLifecycle.js owns the
 * session itself; useAssistantSession.js joins the two.
 */
export function useSessionActions({ sessionId, turnActive, stream, webEnabled, writeEnabled, setUserTurns, setTurnActive, setLocalError }) {
  const { postAssistantMessage, stopAssistantTurn } = useApi();

  const sendMessage = useCallback(async (text, uiState) => {
    if (!sessionId) return;
    setLocalError(null);
    setUserTurns((prev) => [...prev, { role: MESSAGE_ROLE.USER, text, atIndex: stream.messages.length }]);
    setTurnActive(true);  // turn is now in flight until the stream's done/error
    try {
      await postWhenTurnSlotFree(() => postAssistantMessage(sessionId, { text, uiState, webEnabled, writeEnabled }));
    } catch (err) {
      // The optimistic user turn stays in the transcript; surface the failure
      // so the user knows the message didn't reach the assistant.
      setLocalError(t('assistant.sendFailed', { error: err?.message || err }));
      setTurnActive(false);
    }
  }, [sessionId, stream.messages.length, webEnabled, writeEnabled, postAssistantMessage]);

  // Ask the server to cancel the in-flight turn. turnActive stays true until
  // the stream's terminal `stopped` frame arrives (server truth, same as
  // done/error), so the UI can't unlock before the turn thread actually ends.
  const stopTurn = useCallback(async () => {
    if (!sessionId || !turnActive) return;
    try {
      await stopAssistantTurn(sessionId);
    } catch (err) {
      setLocalError(t('assistant.stopTurnFailed', { error: err?.message || err }));
    }
  }, [sessionId, turnActive, stopAssistantTurn]);

  // Client-answered meta-commands (/help, /skills, /actions): show the user
  // turn and the local response in the transcript without any server call.
  const addLocalExchange = useCallback((userText, responseText) => {
    setUserTurns((prev) => [...prev,
      { role: MESSAGE_ROLE.USER, text: userText, atIndex: stream.messages.length },
      { role: MESSAGE_ROLE.LOCAL, text: responseText, atIndex: stream.messages.length },
    ]);
  }, [stream.messages.length]);

  return { sendMessage, stopTurn, addLocalExchange };
}
