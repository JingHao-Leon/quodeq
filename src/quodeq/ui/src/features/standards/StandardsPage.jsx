import { useEffect, useRef, useState } from 'react';
import { useStandards } from './hooks/useStandards.js';
import { useVisibleStandards } from './hooks/useVisibleStandards.js';
import { useStandardsOverrides } from './hooks/useStandardsOverrides.js';
import StandardsTable from './components/StandardsTable.jsx';
import StandardEditor from './components/StandardEditor.jsx';
import ImportModal from './components/ImportModal.jsx';
import PageToolbar from '../../components/PageToolbar.jsx';
import { useAppState } from '../../hooks/useAppState.js';
import { t } from '../../strings/index.js';
import { getVisibilityState } from '../../utils/visibleStandards.js';
import { SettingsMovedNote } from './components/SettingsMovedNote.jsx';
import { ACTION_TYPE } from '../../vocab/actionType.js';
import { ASSISTANT_ACTION_APPLIED_EVENT } from '../../constants.js';

// Which screen the page shows: the table, or the editor in create/edit mode.
const VIEW_MODE = { LIST: 'list', EDIT: 'edit', NEW: 'new' };

export function useStandardsPageActions(refresh, handleDelete, addVisible, removeVisible) {
  const [view, setView] = useState({ mode: VIEW_MODE.LIST });
  const [showImport, setShowImport] = useState(false);

  const handleEdit = (standardId) => setView({ mode: VIEW_MODE.EDIT, standardId });
  const handleNewStandard = () => setView({ mode: VIEW_MODE.NEW });
  const handleEditorBack = () => { setView({ mode: VIEW_MODE.LIST }); refresh(); };
  const handleSaved = (savedId) => { if (savedId) addVisible(savedId); setView({ mode: VIEW_MODE.LIST }); refresh(); };
  const handleImported = (importedId) => { if (importedId) addVisible(importedId); setShowImport(false); refresh(); };
  const handleDeleteWithCleanup = async (id) => {
    removeVisible(id);
    const ok = await handleDelete(id);
    if (!ok) {
      // Delete failed server-side: restore the optimistic visibility removal
      // instead of leaving the standard hidden while it still exists.
      console.warn('[StandardsPage] delete failed, restoring visibility for', id);
      addVisible(id);
    }
  };

  useAssistantCreatedStandard({ view, setView, addVisible });

  return {
    view,
    showImport, setShowImport,
    handleEdit, handleNewStandard, handleEditorBack,
    handleSaved, handleImported, handleDeleteWithCleanup,
  };
}

// A standard the assistant created while this page is open: make it visible
// for the project, as a manual create does, and open it from the list. An
// open editor stays put so unsaved edits are never thrown away; the app-level
// handler refetches the list either way.
function useAssistantCreatedStandard({ view, setView, addVisible }) {
  const latest = useRef(null);
  latest.current = { view, addVisible };
  useEffect(() => {
    const onApplied = (event) => {
      const { actionType, standardId } = event.detail || {};
      if (actionType !== ACTION_TYPE.CREATE_STANDARD || !standardId) return;
      latest.current.addVisible(standardId);
      if (latest.current.view.mode === VIEW_MODE.LIST) setView({ mode: VIEW_MODE.EDIT, standardId });
    };
    window.addEventListener(ASSISTANT_ACTION_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(ASSISTANT_ACTION_APPLIED_EVENT, onApplied);
  }, [setView]);
}

function StandardsListView({ grouped, loading, error, actions, customizedCounts }) {
  return (
    <>
      {error && <p className="inline-error inline-error--spaced">{error}</p>}
      {loading ? (
        <div className="standards-loading">{t('standards.loadingStandards')}</div>
      ) : (
        <StandardsTable grouped={grouped} actions={actions} customizedCounts={customizedCounts} />
      )}
    </>
  );
}

// Where the server moved this project's legacy repo settings from, if it just did.
function useMigratedFrom(projectId) {
  const [migratedFrom, setMigratedFrom] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setMigratedFrom(null);
    getVisibilityState(projectId, { isStale: () => cancelled })
      .then((state) => { if (!cancelled) setMigratedFrom(state.migratedFrom); })
      .catch((err) => console.warn('[StandardsPage] could not read the migration note:', err));
    return () => { cancelled = true; };
  }, [projectId]);
  return migratedFrom;
}

export default function StandardsPage({ onRescan }) {
  const { selectedProject } = useAppState();
  // Every project, shared ones included, keeps its toggles in the server's
  // per-project settings file; the browser set is only the read cache.
  const { isVisible, toggle, add: addVisible, remove: removeVisible } = useVisibleStandards({ projectId: selectedProject });
  const migratedFrom = useMigratedFrom(selectedProject);
  // A new standard only reaches the Evaluate picker once it is visible for
  // this project. Create does that in handleSaved; duplicate and import
  // land here and in handleImported.
  const { grouped, loading, error, refresh, handleDelete, handleDuplicate } = useStandards({ onDuplicated: addVisible });
  const { counts: customizedCounts } = useStandardsOverrides(selectedProject);
  const {
    view,
    showImport,
    setShowImport,
    handleEdit,
    handleNewStandard,
    handleEditorBack,
    handleSaved,
    handleImported,
    handleDeleteWithCleanup,
  } = useStandardsPageActions(refresh, handleDelete, addVisible, removeVisible);

  if (view.mode === VIEW_MODE.EDIT || view.mode === VIEW_MODE.NEW) {
    return <StandardEditor standardId={view.standardId} isNew={view.mode === VIEW_MODE.NEW} onBack={handleEditorBack} onSaved={handleSaved} onRescan={onRescan} />;
  }

  const activeCount = grouped
    ? Object.values(grouped).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
    : 0;

  return (
    <div className="standards-page standards-page--terminal">
      <PageToolbar title={t('standards.termName')} facts={t('standards.activeCount', { count: activeCount })}>
        <span className="standards-page-header-actions">
          <button type="button" className="btn-secondary" onClick={() => setShowImport(true)}>{t('standards.importBtn')}</button>
          <button type="button" className="btn-primary" onClick={handleNewStandard}>{t('standards.newStandardBtn')}</button>
        </span>
      </PageToolbar>
      <SettingsMovedNote projectId={selectedProject} migratedFrom={migratedFrom} />
      <StandardsListView grouped={grouped} loading={loading} error={error} actions={{ onEdit: handleEdit, onDelete: handleDeleteWithCleanup, onDuplicate: handleDuplicate, isVisible, onToggleVisibility: toggle }} customizedCounts={customizedCounts} />
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={handleImported} />}
    </div>
  );
}
