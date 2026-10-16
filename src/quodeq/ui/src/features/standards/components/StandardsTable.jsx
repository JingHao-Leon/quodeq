import { useMemo, useState } from 'react';
import { STANDARD_TYPES, UNKNOWN_STANDARD_TYPE, standardBaseLabel } from '../hooks/useStandards.js';
import { useStandardRowModals } from '../hooks/useStandardRowModals.js';
import { ICON_STAR_FILLED, ICON_STAR_OUTLINE } from '../../../constants/navigation.jsx';
import Icon from '../../../components/Icon.jsx';
import { DownloadGlyph, TrashGlyph } from '../../../components/glyphs.jsx';
import { t } from '../../../strings/index.js';
import { onActivateKeys } from '../../../utils/activateKeys.js';
import { pluralKey } from '../../../utils/plural.js';
import StandardsModal from './StandardsModal.jsx';
import StandardSyncCell from './StandardSyncCell.jsx';
import StandardSyncActions from './StandardSyncActions.jsx';
import StandardRemoteRow from './StandardRemoteRow.jsx';
import { standardSourceLine, standardVersionTitle } from '../../../models/standard.js';

// The row-action glyph box, a step down from the sidebar rail's icons.
const ROW_ICON_SIZE = 14;


function ConfirmDeleteModal({ standardName, principleCount, requirementCount, onConfirm, onCancel }) {
  const [typed, setTyped] = useState('');
  const hasContent = principleCount > 0 || requirementCount > 0;
  const confirmText = standardName.toLowerCase().trim();
  const canDelete = !hasContent || typed.toLowerCase().trim() === confirmText;

  return (
    <StandardsModal
      title={t('standards.deleteStandardTitle')}
      onCancel={onCancel}
      actions={<button type="button" className="btn-danger" onClick={onConfirm} disabled={!canDelete}>{t('violations.delete')}</button>}
    >
      {hasContent ? (
        <>
          <p className="modal-body modal-body--warning">
            <strong>{standardName}</strong> {t('standards.contains')} <strong>{t(pluralKey(principleCount, 'standards.principlesCountOne', 'standards.principlesCountMany'), { count: principleCount })}</strong> {t('standards.and')} <strong>{t(pluralKey(requirementCount, 'standards.requirementsCountOne', 'standards.requirementsCountMany'), { count: requirementCount })}</strong>. {t('standards.cannotBeUndone')}
          </p>
          <p className="modal-body">{t('standards.typePrefix')} <strong>{standardName}</strong> {t('standards.toConfirmSuffix')}</p>
          <input className="modal-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={standardName} autoFocus />
        </>
      ) : (
        <p className="modal-body">{t('standards.deleteConfirmPrefix')} <strong>{standardName}</strong>?</p>
      )}
    </StandardsModal>
  );
}

function DuplicateModal({ standardId, onConfirm, onCancel }) {
  const [newId, setNewId] = useState(`${standardId}-copy`);
  return (
    <StandardsModal
      title={t('standards.duplicateStandardTitle')}
      onCancel={onCancel}
      actions={<button type="button" className="btn-primary" onClick={() => onConfirm(newId)} disabled={!newId.trim()}>{t('standards.duplicate')}</button>}
    >
      <p className="modal-body">{t('standards.enterNewId')}</p>
      <input className="modal-input" value={newId} onChange={(e) => setNewId(e.target.value)} autoFocus />
    </StandardsModal>
  );
}

function StarToggle({ isVisible, standardId, onToggleVisibility }) {
  return (
    <button
      type="button"
      className={`standards-star-btn${isVisible ? ' standards-star-btn--on' : ''}`}
      title={isVisible ? t('standards.enabledTitle') : t('standards.disabledTitle')}
      onClick={(e) => { e.stopPropagation(); onToggleVisibility(standardId); }}
    >
      {isVisible ? ICON_STAR_FILLED : ICON_STAR_OUTLINE}
    </button>
  );
}

function RowActions({ standard, isDeletable, isEditable, onOpen, onDuplicate, onDownload, onDelete }) {
  const openLabel = isEditable ? t('standards.edit') : t('standards.view');
  return (
    <div className="standards-row-actions" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="standards-row-action" onClick={onOpen} title={openLabel} aria-label={`${openLabel} ${standard.name}`}>
        {isEditable ? (
          <Icon size={ROW_ICON_SIZE}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </Icon>
        ) : (
          <Icon size={ROW_ICON_SIZE}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </Icon>
        )}
      </button>
      <button type="button" className="standards-row-action" onClick={onDuplicate} title={t('standards.duplicate')} aria-label={`${t('standards.duplicate')} ${standard.name}`}>
        <Icon size={ROW_ICON_SIZE} strokeLinecap={null} strokeLinejoin={null}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </Icon>
      </button>
      <button type="button" className="standards-row-action" onClick={onDownload} title={t('standards.download')} aria-label={`${t('standards.download')} ${standard.name}`}>
        <DownloadGlyph size={ROW_ICON_SIZE} square />
      </button>
      {isDeletable && (
        <button type="button" className="standards-row-action standards-row-action--danger" onClick={onDelete} title={t('violations.delete')} aria-label={`${t('violations.delete')} ${standard.name}`}>
          <TrashGlyph size={ROW_ICON_SIZE} square />
        </button>
      )}
    </div>
  );
}

function isDeletableStandard(type) {
  return type !== STANDARD_TYPES.ISO && type !== STANDARD_TYPES.WCAG && type !== STANDARD_TYPES.QUODEQ;
}

function StandardRowMain({
  standard, isVisible, onToggleVisibility, baseLabel, customizedCounts, principleCount, requirementCount,
  isDeletable, onEdit, openDuplicate, handleDownload, openDelete, shared,
}) {
  const sourceLine = standardSourceLine(standard);
  return (
    <div
      className={`standards-row${isVisible ? '' : ' standards-row--disabled'}`}
      role="button"
      tabIndex={0}
      aria-pressed={isVisible}
      onClick={() => onToggleVisibility(standard.id)}
      onKeyDown={onActivateKeys(() => onToggleVisibility(standard.id))}
    >
      <div className="standards-cell standards-cell--name">
        <span className="standards-row-name" title={standard.description || undefined}>{standard.name}</span>
        {sourceLine && <span className="standards-row-subtitle">{sourceLine}</span>}
      </div>
      <div className="standards-cell standards-cell--base">
        <span className={`standards-base-pill standards-base-pill--${standard.type || 'unknown'}`}>{baseLabel}</span>
        {customizedCounts?.[standard.id] > 0 && (
          <span className="standards-customized-badge">
            {t('standards.customizedCount', { count: customizedCounts[standard.id] })}
          </span>
        )}
      </div>
      <div className="standards-cell standards-cell--num standards-cell--principles">{principleCount}</div>
      <div className="standards-cell standards-cell--num">{requirementCount}</div>
      <div className="standards-cell standards-cell--version" title={standardVersionTitle(standard) || undefined}>{standard.version || ''}</div>
      {shared && <StandardSyncCell standard={standard} />}
      <div className="standards-cell standards-cell--enabled">
        <StarToggle isVisible={isVisible} standardId={standard.id} onToggleVisibility={onToggleVisibility} />
      </div>
      <div className="standards-cell standards-cell--actions">
        {shared && <StandardSyncActions standard={standard} sync={shared.sync} />}
        <RowActions
          standard={standard}
          isDeletable={isDeletable}
          isEditable={isDeletable}
          onOpen={() => onEdit(standard.id)}
          onDuplicate={openDuplicate}
          onDownload={handleDownload}
          onDelete={openDelete}
        />
      </div>
    </div>
  );
}

function StandardRow({ standard, isVisible, onEdit, onDelete, onDuplicate, onToggleVisibility, customizedCounts, shared }) {
  const {
    showDeleteModal, showDuplicateModal, downloadError,
    openDelete, closeDelete, confirmDelete,
    openDuplicate, closeDuplicate, confirmDuplicate,
    handleDownload,
  } = useStandardRowModals({ standard, onDelete, onDuplicate });
  const principleCount = standard.principleCount ?? standard.principles?.length ?? 0;
  const requirementCount = standard.requirementCount ?? (standard.principles || []).reduce((sum, p) => sum + (p.requirements?.length ?? 0), 0);
  const isDeletable = isDeletableStandard(standard.type);
  const baseLabel = standardBaseLabel(standard) || standard.type || t('standards.baseUnknown');

  return (
    <>
      <StandardRowMain
        standard={standard} isVisible={isVisible} onToggleVisibility={onToggleVisibility} baseLabel={baseLabel}
        customizedCounts={customizedCounts} principleCount={principleCount} requirementCount={requirementCount}
        isDeletable={isDeletable} onEdit={onEdit} openDuplicate={openDuplicate} handleDownload={handleDownload} openDelete={openDelete}
        shared={shared}
      />
      {downloadError && (
        <div role="alert" className="standards-row-error">
          {t('standards.downloadError', { message: downloadError })}
        </div>
      )}
      <SyncError message={shared?.sync.errors[standard.id]} />
      {showDeleteModal && (
        <ConfirmDeleteModal
          standardName={standard.name}
          principleCount={principleCount}
          requirementCount={requirementCount}
          onConfirm={confirmDelete}
          onCancel={closeDelete}
        />
      )}
      {showDuplicateModal && (
        <DuplicateModal
          standardId={standard.id}
          onConfirm={confirmDuplicate}
          onCancel={closeDuplicate}
        />
      )}
    </>
  );
}

// The sync column leaves the other columns less room: their headers shorten,
// keeping the full word for hover and screen readers.
function HeadLabel({ full, short, compact }) {
  return compact ? <abbr title={full}>{short}</abbr> : full;
}

function SyncError({ message }) {
  return message ? <div role="alert" className="standards-row-error">{message}</div> : null;
}

function SharedEntry({ standard, shared, rowProps }) {
  if (standard.remote) {
    return (
      <>
        <StandardRemoteRow standard={standard} sync={shared.sync} />
        <SyncError message={shared.sync.errors[standard.id]} />
      </>
    );
  }
  return <StandardRow standard={standard} shared={shared} {...rowProps} isVisible={rowProps.isVisible(standard.id)} />;
}

export default function StandardsTable({ grouped, actions, customizedCounts, shared }) {
  const { onEdit, onDelete, onDuplicate, isVisible, onToggleVisibility } = actions;
  const connected = shared?.connected ? shared : undefined;
  const all = useMemo(
    () => [...(grouped[STANDARD_TYPES.ISO] || []), ...(grouped[STANDARD_TYPES.WCAG] || []), ...(grouped[STANDARD_TYPES.QUODEQ] || []), ...(grouped[STANDARD_TYPES.COMMUNITY] || []), ...(grouped[STANDARD_TYPES.CUSTOM] || []), ...(grouped[UNKNOWN_STANDARD_TYPE] || [])].filter((s) => connected || !s.remote),
    [grouped, connected],
  );

  if (all.length === 0) {
    return (
      <div className="standards-empty">
        <p>{t('standards.noStandardsFound')}</p>
      </div>
    );
  }

  return (
    <div className={`standards-table${connected ? ' standards-table--shared' : ''}`} role="table">
      <div className="standards-table-head" role="row">
        <div className="standards-cell standards-cell--name">{t('standards.colName')}</div>
        <div className="standards-cell standards-cell--base">{t('standards.colBase')}</div>
        <div className="standards-cell standards-cell--num standards-cell--principles">
          <HeadLabel full={t('standards.colPrinciples')} short={t('standards.colPrinciplesShort')} compact={connected} />
        </div>
        <div className="standards-cell standards-cell--num">
          <HeadLabel full={t('standards.colRequirements')} short={t('standards.colRequirementsShort')} compact={connected} />
        </div>
        <div className="standards-cell standards-cell--version">{t('standards.colVersion')}</div>
        {connected && <div className="standards-cell standards-cell--sync">{t('standards.colSync')}</div>}
        <div className="standards-cell standards-cell--enabled">
          <HeadLabel full={t('standards.colEnabled')} short={t('standards.colEnabledShort')} compact={connected} />
        </div>
        <div className="standards-cell standards-cell--actions" />
      </div>
      <div className="standards-table-body">
        {all.map((s) => (
          <SharedEntry
            key={s.id}
            standard={s}
            shared={connected}
            rowProps={{ isVisible, onEdit, onDelete, onDuplicate, onToggleVisibility, customizedCounts }}
          />
        ))}
      </div>
    </div>
  );
}
