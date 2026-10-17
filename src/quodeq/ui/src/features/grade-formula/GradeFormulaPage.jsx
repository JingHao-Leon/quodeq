import { useMemo, useRef, useState } from 'react';
import PageToolbar from '../../components/PageToolbar.jsx';
import useGradeFormula from './useGradeFormula.js';
import { useFormulaInputs } from './hooks/useFormulaInputs.js';
import { useTypesRows } from './hooks/useTypesRows.js';
import { useFullRunDimensions } from './hooks/useFullRunDimensions.js';
import KnobGroups from './knobs/KnobGroups.jsx';
import { knobChanges } from './knobs/knobGroups.js';
import ImpactPanel from './impact/ImpactPanel.jsx';
import PrincipleChart from './chart/PrincipleChart.jsx';
import ReviewSheet from './review/ReviewSheet.jsx';
import { REVIEW_MODE } from './review/reviewModel.js';
import FormulaStatus from './FormulaStatus.jsx';
import TypesTab from './TypesTab.jsx';
import { DimensionsTab } from './tabs.jsx';
import { t } from '../../strings/index.js';
import { pluralKey } from '../../utils/plural.js';
import { usePageFocus } from '../../hooks/usePageFocus.js';

function FormulaBody({ editor, inputs, view }) {
  return (
    <>
      {inputs && (
        <div className="gf-chart-pin">
          <PrincipleChart inputs={inputs} saved={editor.saved} draft={editor.draft} highlight={view.hoverGroup}
            litProject={view.litProject} onHoverProject={view.setLitProject} />
        </div>
      )}
      <KnobGroups draft={editor.draft} saved={editor.saved} defaults={editor.defaults} ranges={editor.ranges} inputs={inputs}
        update={editor.update} onHoverGroup={view.setHoverGroup} />
    </>
  );
}

// labelKey, not label: the catalog is read at render so the tab strip picks
// up the active locale like every other visible string on the page.
const TABS = [
  { id: 'formula', labelKey: 'gradeFormula.tabFormula', Body: FormulaBody },
  { id: 'types', labelKey: 'gradeFormula.tabTypes', Body: TypesTab },
  { id: 'dimensions', labelKey: 'gradeFormula.tabDimensions', Body: DimensionsTab },
];

// The tab `tab` state falls back to when it matches no TABS entry.
const DEFAULT_TAB_ID = TABS[0].id;

// A single panel is rendered at a time (swapped by active tab), so every tab
// button controls the same panel id; the panel in turn is labelled by
// whichever tab button is currently active.
const TAB_PANEL_ID = 'gf-tabpanel';

/** What the page knows about the reader's project when it opens outside a run. */
export const EMPTY_SCOPE = Object.freeze({
  project: null, runId: null, dimensions: [], dimension: null, runDimensions: [], selectedSource: null,
});

function tabButtonId(tabId) {
  return `gf-tab-${tabId}`;
}

function TabButtons({ tab, setTab }) {
  return (
    <div className="term-seg" role="tablist" aria-label={t('gradeFormula.tabsAria')}>
      {TABS.map((tabDef) => (
        <button
          key={tabDef.id}
          id={tabButtonId(tabDef.id)}
          type="button"
          role="tab"
          aria-selected={tab === tabDef.id}
          aria-controls={TAB_PANEL_ID}
          className={`term-btn${tab === tabDef.id ? ' term-btn--on' : ''}`}
          onClick={() => setTab(tabDef.id)}
        >
          {t(tabDef.labelKey)}
        </button>
      ))}
    </div>
  );
}

// Native fieldset disable cascades to every slider/button in the tab
// body, closing the mid-flight-edit window while an Apply/Reset is in
// progress (the hook captures `draft` at callback creation). The
// gf-tab-body class supplies the border/radius/padding; the inline
// reset only clears the browser fieldset's default margin and
// min-inline-size so it lays out like the plain div it replaces.
// NOTE: fieldset[disabled] only disables form controls, not custom
// div-based sliders. GradeBoundaryBar.startDrag guards against
// fieldset[disabled] in JS, and base.css adds pointer-events:none
// on .gf-tab-body:disabled .gf-boundary-divider as a CSS companion.
// The fieldset is disabled only while the PUT/DELETE request itself is
// in flight, not while the background rescore pass runs after it lands:
// sliders stay usable and a second Apply restarts the pass.
function TabBody({ busy, ActiveBody, activeTabId, bodyProps }) {
  return (
    <fieldset
      id={TAB_PANEL_ID}
      className="gf-tab-body"
      role="tabpanel"
      aria-labelledby={tabButtonId(activeTabId)}
      disabled={busy}
      style={{ margin: 0, minInlineSize: 'auto' }}
    >
      <ActiveBody {...bodyProps} />
    </fieldset>
  );
}

// The TYPES tab's rows for the reader's run, and the dimension it is
// narrowed to.
function useTypesTab(scope, draft) {
  const [dimensionFilter, setDimensionFilter] = useState(null);
  // The root dashboard is the overview shape (no bodies) off run pages; the
  // TYPES rows count violations, so they read the full dashboard for the run.
  const runDimensions = useFullRunDimensions({
    project: scope.project, runId: scope.runId, source: scope.selectedSource, dimensions: scope.runDimensions,
  });
  const { rows, loading } = useTypesRows({
    project: scope.project, runId: scope.runId, dimensions: runDimensions,
    selectedSource: scope.selectedSource, draft,
  });
  return { rows, loading, dimensionFilter, setDimensionFilter, dimensions: scope.dimensions, noRun: !scope.runId };
}

// The page's own view state: the open tab, the project lit across the chart
// and the impact panel, the knob group under the pointer, and the review
// sheet (null, or the REVIEW_MODE it opened in). A failed write keeps the
// sheet open with the error inside it.
function usePageView(editor) {
  const [tab, setTab] = useState(DEFAULT_TAB_ID);
  const [litProject, setLitProject] = useState(null);
  const [hoverGroup, setHoverGroup] = useState(null);
  const [review, setReviewMode] = useState(null);
  const [writeFailed, setWriteFailed] = useState(false);
  const setReview = (mode) => { setWriteFailed(false); setReviewMode(mode); };
  const confirm = async () => {
    const done = await (review === REVIEW_MODE.RESET ? editor.resetToDefaults() : editor.apply());
    if (done) setReview(null);
    else setWriteFailed(true);
  };
  return { tab, setTab, litProject, setLitProject, hoverGroup, setHoverGroup, review, setReview, confirm, writeFailed };
}

function LoadingPage({ error }) {
  return (
    <div className="settings-page settings-page--terminal">
      <PageToolbar title={t('gradeFormula.headerName')} facts={t('gradeFormula.headerLoading')} />
      {error ? <p className="settings-description">{error}</p> : null}
    </div>
  );
}

function headerFacts(editor, projectCount) {
  const defaultsKey = editor.retiredCustom ? 'gradeFormula.defaultsActiveRetired' : 'gradeFormula.defaultsActive';
  const state = t(editor.isCustom ? 'gradeFormula.customActive' : defaultsKey);
  return t(pluralKey(projectCount, 'gradeFormula.headerFactsOne', 'gradeFormula.headerFacts'), { count: projectCount, state });
}

/**
 * Settings › Grade formula: the principle chart and the knob groups, beside
 * what the draft does to every project; the types table; the dimension
 * weights; and a review sheet before apply or reset.
 * @param {{projects?: Array<{id: string, name: string}>}} props.navigation
 * @param {{project: string|null, runId: string|null, dimensions: string[], dimension: string|null, runDimensions: Array, selectedSource: string|null}} props.scope
 *   `dimensions` are names; `runDimensions` the dashboard's run dimensions with their findings.
 */
export default function GradeFormulaPage({ navigation, scope = EMPTY_SCOPE }) {
  const editor = useGradeFormula();
  const view = usePageView(editor);
  const { inputs, loading, failed, retry } = useFormulaInputs();
  const actionsRef = useRef(null);
  const types = useTypesTab(scope, editor.draft);
  usePageFocus('gradeFormulaTab', { tab: view.tab, dimension: types.dimensionFilter });
  const projects = navigation?.projects;
  const names = useMemo(() => Object.fromEntries((projects || []).map((p) => [p.id, p.name])), [projects]);
  if (!editor.draft) return <LoadingPage error={editor.error} />;

  // Fall back to the first tab rather than indexing into undefined if `tab`
  // ever holds a value that doesn't match any TABS entry.
  const ActiveBody = (TABS.find((entry) => entry.id === view.tab) ?? TABS[0]).Body;
  const bodyProps = { editor, inputs, view, draft: editor.draft, ranges: editor.ranges, update: editor.update, ...types };
  return (
    <div className="settings-page settings-page--terminal">
      <PageToolbar title={t('gradeFormula.headerName')} facts={headerFacts(editor, inputs?.projects?.length ?? (projects || []).length)}>
        <TabButtons tab={view.tab} setTab={view.setTab} />
      </PageToolbar>
      <div className="gf-split">
        <TabBody busy={editor.busy} ActiveBody={ActiveBody} activeTabId={view.tab} bodyProps={bodyProps} />
        <ImpactPanel inputs={inputs} loading={loading} failed={failed} names={names} saved={editor.saved} draft={editor.draft}
          isDirty={editor.isDirty} isCustom={editor.isCustom} onRetry={retry} actionsRef={actionsRef} changedCount={knobChanges(editor.draft, editor.saved).length}
          litProject={view.litProject} onLitProject={view.setLitProject} busy={editor.busy}
          onReview={() => view.setReview(REVIEW_MODE.APPLY)} onUndo={() => editor.update(editor.saved)}
          onReset={() => view.setReview(REVIEW_MODE.RESET)} />
      </div>
      <FormulaStatus error={editor.error} partialNotice={editor.partialNotice} rescoreProgress={editor.rescoreProgress} />
      {view.review && (
        <ReviewSheet mode={view.review} target={view.review === REVIEW_MODE.RESET ? editor.defaults : editor.draft}
          saved={editor.saved} inputs={inputs} names={names} busy={editor.busy}
          error={view.writeFailed ? editor.error : null} fallbackFocus={actionsRef}
          onConfirm={view.confirm} onCancel={() => view.setReview(null)} />
      )}
    </div>
  );
}
