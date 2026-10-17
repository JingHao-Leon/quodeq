import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildMetaResponse, matchCommands, parseMetaCommand, META_COMMAND_NAME } from '../commands.js';
import { KEY } from '../../../vocab/keyboard.js';
import { withPageFocus } from '../../../hooks/usePageFocus.js';

// Must equal the `.assistant-drawer-input` max-height in assistant.css: the
// auto-grow below stops where the CSS cap would clip anyway.
const COMPOSER_MAX_HEIGHT_PX = 120;

/**
 * AssistantDrawer.jsx (AssistantPane)'s composer state: the draft text, the
 * slash-command menu, the messages queued behind a running turn, and the
 * send/keydown/change handlers.
 */

// Give the prompt keyboard focus when this pane becomes the frontmost tab
// (drawer open or tab switch) so the user can type immediately without
// clicking in. The parent flips display:none→flex in the same commit, so by
// the time this effect runs the textarea is laid out and focusable. The
// textarea stays enabled during a turn, so focus never waits for one to end.
//
// Also auto-grows the composer with its content (capped in CSS via
// max-height). Keyed on draft so external prefills (welcome cards, slash
// rows) resize too, not only direct typing.
function useComposerFocusEffects({ active, draft, inputRef }) {
  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [draft]);
}

// The slash-command menu's own key handling (arrow nav, escape, tab/enter to
// accept). Returns true when it handled the event, so the caller skips the
// plain Enter-to-send branch.
function handleMenuKeyDown({ event, suggestions, menuIndex, setMenuIndex, setMenuDismissed, acceptSuggestion, draft }) {
  if (event.key === KEY.ARROW_DOWN) { event.preventDefault(); setMenuIndex((i) => (i + 1) % suggestions.length); return true; }
  if (event.key === KEY.ARROW_UP) { event.preventDefault(); setMenuIndex((i) => (i - 1 + suggestions.length) % suggestions.length); return true; }
  if (event.key === KEY.ESCAPE) { event.preventDefault(); setMenuDismissed(true); return true; }
  if (event.key === KEY.TAB) { event.preventDefault(); acceptSuggestion(suggestions[menuIndex]); return true; }
  // Enter completes a partial prefix; once the draft IS the command it sends.
  if (event.key === KEY.ENTER && !event.shiftKey && draft.trim() !== `/${suggestions[menuIndex].name}`) {
    event.preventDefault(); acceptSuggestion(suggestions[menuIndex]); return true;
  }
  return false;
}

/**
 * Messages typed while a turn runs. Each one waits, in order, and is sent
 * once the turn before it ends, with the page context of that moment rather
 * than of the moment it was typed.
 */
function useQueuedMessages({ streaming, sendMessage, uiState }) {
  const [queued, setQueued] = useState([]);
  useEffect(() => {
    if (streaming || queued.length === 0) return;
    const [next, ...rest] = queued;
    setQueued(rest);
    sendMessage(next, withPageFocus(uiState));
  }, [streaming, queued, sendMessage, uiState]);
  const enqueue = useCallback((text) => setQueued((prev) => [...prev, text]), []);
  const dropQueued = useCallback((index) => setQueued((prev) => prev.filter((_, i) => i !== index)), []);
  return { queued, enqueue, dropQueued };
}

/**
 * The assistant drawer's input: draft text, the slash-command menu and the
 * keyboard handling that drives both.
 *
 * Enter sends, Shift+Enter breaks a line, and while the command menu is open
 * the arrows move through it, Tab completes and Escape dismisses it. While a
 * turn runs, Enter queues the message instead and Escape with an empty draft
 * stops the turn. Meta commands (`/clear` and friends) are answered locally
 * instead of being sent to the model; `/clear` waits for the turn to end.
 */
export function useAssistantComposer({ active, streaming, catalog, readOnly, uiState, sendMessage, resetConversation, addLocalExchange, stopTurn }) {
  const [draft, setDraft] = useState('');
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const inputRef = useRef(null);
  const { queued, enqueue, dropQueued } = useQueuedMessages({ streaming, sendMessage, uiState });

  useComposerFocusEffects({ active, draft, inputRef });

  const suggestions = useMemo(
    () => matchCommands(catalog, draft, { readOnly }),
    [catalog, draft, readOnly],
  );
  const menuVisible = suggestions.length > 0 && !menuDismissed;

  const acceptSuggestion = useCallback((cmd) => {
    setDraft(`/${cmd.name} `);
    setMenuIndex(0);
  }, []);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    const meta = parseMetaCommand(text);
    if (meta === META_COMMAND_NAME.CLEAR) { if (streaming) return; resetConversation(); setDraft(''); return; }
    if (meta) { addLocalExchange(text, buildMetaResponse(meta, catalog, { readOnly })); setDraft(''); return; }
    if (streaming || queued.length > 0) enqueue(text);
    else sendMessage(text, withPageFocus(uiState));
    setDraft('');
  }, [draft, streaming, queued.length, enqueue, sendMessage, uiState, catalog, addLocalExchange, resetConversation, readOnly]);

  const handleKeyDown = useCallback((event) => {
    if (menuVisible && handleMenuKeyDown({ event, suggestions, menuIndex, setMenuIndex, setMenuDismissed, acceptSuggestion, draft })) {
      return;
    }
    if (event.key === KEY.ESCAPE && streaming && !draft.trim()) { event.preventDefault(); stopTurn?.(); return; }
    if (event.key === KEY.ENTER && !event.shiftKey) { event.preventDefault(); handleSend(); }
  }, [menuVisible, suggestions, menuIndex, draft, acceptSuggestion, handleSend, streaming, stopTurn]);

  const handleChange = useCallback((event) => {
    setDraft(event.target.value);
    setMenuDismissed(false);
    setMenuIndex(0);
  }, []);

  return {
    draft, setDraft, inputRef, suggestions, menuIndex, menuVisible,
    acceptSuggestion, handleSend, handleKeyDown, handleChange, queued, dropQueued,
  };
}
