import { t } from '../../../strings/index.js';
import { severityLabel } from '../../../strings/labels.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { FINDING_GROUP, FINDING_STATUS } from '../violationsVocab.js';
import { severityCounts, statusPool } from './workbenchModel.js';
import WorkbenchMenu from './WorkbenchMenu.jsx';
import WorkbenchSearch from './WorkbenchSearch.jsx';

const MENU_KEY = Object.freeze({ SEVERITY: 'severity', DIMENSION: 'dimension', STATUS: 'status', GROUP: 'group' });
const GROUP_LABEL = Object.freeze({
  [FINDING_GROUP.NONE]: 'violations.wbGroupNone',
  [FINDING_GROUP.FOLDERS]: 'violations.wbGroupFolders',
  [FINDING_GROUP.REQUIREMENT]: 'violations.wbGroupRequirement',
  [FINDING_GROUP.FILE]: 'violations.wbGroupFile',
  [FINDING_GROUP.DIMENSION]: 'violations.wbGroupDimension',
});
const STATUS_LABEL = Object.freeze({
  [FINDING_STATUS.OPEN]: 'violations.wbStatusOpen',
  [FINDING_STATUS.DISMISSED]: 'violations.wbStatusDismissed',
  [FINDING_STATUS.ALL]: 'violations.wbAll',
});

/** The Map area the list is narrowed to (from the Risk tab's View Details), as one chip. */
function AreaChip({ area, onRemove }) {
  if (!area) return null;
  return (
    <div className="wb-chips">
      <span className="wb-chip">
        {t('violations.wbAreaChip', { name: area.name })}
        <button type="button" aria-label={t('violations.wbRemoveAreaChip', { name: area.name })} onClick={onRemove}>×</button>
      </span>
    </div>
  );
}

function PathChips({ paths, removePath, setPaths }) {
  if (!paths.length) return null;
  return (
    <div className="wb-chips">
      {paths.map((p) => (
        <span key={p} className="wb-chip">
          {t('violations.wbPathChip', { path: p })}
          <button type="button" aria-label={t('violations.wbRemoveChip', { path: p })} onClick={() => removePath(p)}>×</button>
        </span>
      ))}
      <button type="button" className="wb-link wb-link--muted" onClick={() => setPaths([])}>{t('violations.wbClearChips')}</button>
    </div>
  );
}

function menus({ state, set, dimensions, statusCounts, sev }) {
  const all = t('violations.wbAll');
  return [
    { key: MENU_KEY.SEVERITY, label: t('violations.wbMenuSeverity'), value: state.severity, valueLabel: state.severity ? severityLabel(state.severity) : all,
      options: [{ value: null, label: all }, ...SEVERITY_ORDER.map((l) => ({ value: l, label: severityLabel(l), count: sev[l] }))],
      onPick: (v) => set({ severity: v }) },
    { key: MENU_KEY.DIMENSION, label: t('violations.wbMenuDimension'), value: state.dimension, valueLabel: state.dimension || all,
      options: [{ value: null, label: all }, ...dimensions.map(([d, n]) => ({ value: d, label: d, count: n }))],
      onPick: (v) => set({ dimension: v }) },
    { key: MENU_KEY.STATUS, label: t('violations.wbMenuStatus'), value: state.status, valueLabel: t(STATUS_LABEL[state.status]),
      options: Object.values(FINDING_STATUS).map((s) => ({ value: s, label: t(STATUS_LABEL[s]), count: statusCounts[s] })),
      onPick: (v) => set({ status: v }) },
    { key: MENU_KEY.GROUP, label: t('violations.wbMenuGroup'), value: state.group, valueLabel: t(GROUP_LABEL[state.group]),
      options: Object.values(FINDING_GROUP).map((g) => ({ value: g, label: t(GROUP_LABEL[g]) })),
      onPick: (v) => set({ group: v }) },
  ];
}

/** Search, the four filter menus and the path chips above the list. */
export default function WorkbenchBar({ findings, state, set, addPath, removePath, setPaths, dimensions, statusCounts, inputRef }) {
  const sev = severityCounts(statusPool(findings, state.status));
  return (
    <>
      <div className="wb-bar">
        <WorkbenchSearch findings={findings} q={state.q} onQuery={(q) => set({ q })} onPickPath={addPath} inputRef={inputRef} />
        {menus({ state, set, dimensions, statusCounts, sev }).map(({ key, ...m }) => <WorkbenchMenu key={key} {...m} />)}
      </div>
      <AreaChip area={state.area} onRemove={() => set({ area: null })} />
      <PathChips paths={state.paths} removePath={removePath} setPaths={setPaths} />
    </>
  );
}
