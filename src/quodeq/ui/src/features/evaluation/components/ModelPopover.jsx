import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReviewerFields from '../../onboarding/components/reviewer/ReviewerFields.jsx';
import { compareReviewerOrder, useReviewerDraft } from '../../onboarding/hooks/useReviewerChoice.js';
import { ProviderPillGroup } from '../../settings/components/ProviderPillGroup.jsx';
import { useAiClientList } from '../../settings/hooks/useAiClientList.js';
import { findCatalogModel } from '../../settings/hooks/useClientModels.js';
import { useDismissOnOutside } from '../../../hooks/useDismissOnOutside.js';
import { ACTIVE_PROVIDER_KEY, notifyProviderSettingsChanged } from '../../../constants.js';
import { readString } from '../../../adapters/storage.js';
import { t } from '../../../strings/index.js';

// The element inside the anchor cell that takes focus back on close.
const ANCHOR_FOCUS_TARGET = 'button';

/** The AI clients in the neutral reviewer order, and the installed ones' ids. */
function useOrderedClients() {
  const { clients } = useAiClientList();
  return useMemo(() => {
    const ordered = [...clients].sort((a, b) => compareReviewerOrder(a.id, b.id));
    return { ordered, installed: ordered.filter((c) => c.installed !== false).map((c) => c.id) };
  }, [clients]);
}

/**
 * Moves focus into the panel on open and back to the anchor's button on
 * close, and keeps the panel's right edge on the anchor cell's right edge.
 */
function useAnchoredPanel(anchorRef, panelRef) {
  const [right, setRight] = useState(0);
  useLayoutEffect(() => {
    const frame = panelRef.current?.offsetParent;
    const anchor = anchorRef.current;
    if (frame && anchor) setRight(frame.getBoundingClientRect().right - anchor.getBoundingClientRect().right);
  }, [anchorRef, panelRef]);
  useEffect(() => {
    panelRef.current?.focus();
    const anchor = anchorRef.current;
    return () => anchor?.querySelector(ANCHOR_FOCUS_TARGET)?.focus();
  }, [anchorRef, panelRef]);
  return right;
}

/** The confirm button's words: "use {model}" by its catalog label, or a prompt while none is picked. */
function confirmLabel(draft) {
  if (!draft.model) return t('evaluate.chooseModel');
  const label = findCatalogModel(draft.catalog, draft.model)?.label || draft.model;
  return t('evaluate.modelPopoverUse', { model: label });
}

function ModelPopoverPanel({ anchorRef, onClose, onOpenSettings }) {
  const panelRef = useRef(null);
  const { ordered, installed } = useOrderedClients();
  const [initial] = useState(() => readString(ACTIVE_PROVIDER_KEY, '') || null);
  const draft = useReviewerDraft({ providers: installed, initial });
  const right = useAnchoredPanel(anchorRef, panelRef);
  const confirmText = confirmLabel(draft);
  useDismissOnOutside(true, panelRef, onClose, anchorRef);

  const use = () => {
    draft.save();
    notifyProviderSettingsChanged();
    onClose();
  };
  const title = t('evaluate.modelPopoverTitle');
  return (
    <div ref={panelRef} className="eval-model-popover" role="dialog" aria-label={title} tabIndex={-1} style={{ right }}>
      <div className="eval-model-popover__title">{title}</div>
      <ProviderPillGroup clients={ordered} activeId={draft.providerId} onSelect={draft.select} />
      {draft.providerId && (
        <ReviewerFields
          key={draft.providerId} providerId={draft.providerId} model={draft.model} effort={draft.effort}
          onModel={draft.setModel} onEffort={draft.setEffort}
        />
      )}
      <div className="eval-model-popover__footer">
        <button type="button" className="term-btn term-btn--secondary" onClick={onOpenSettings}>
          {t('evaluate.modelPopoverSettings')}
        </button>
        <button type="button" className="term-btn term-btn--primary" disabled={!draft.ready} onClick={use}>
          {confirmText}
        </button>
      </div>
    </div>
  );
}

/**
 * The Evaluate card's model picker: provider pills (uninstalled ones
 * disabled), then that provider's model and effort. A local draft; nothing
 * is stored until "use", and it never starts a scan. Esc or a press outside
 * closes it. `anchorRef` is the model cell it hangs under, right-aligned.
 */
export default function ModelPopover({ open, anchorRef, onClose, onOpenSettings }) {
  if (!open) return null;
  return <ModelPopoverPanel anchorRef={anchorRef} onClose={onClose} onOpenSettings={onOpenSettings} />;
}
