import { t } from '../../../strings/index.js';
import { scoreColorClass } from '../../../utils/formatters.js';
import { formatDurationCoarse } from '../../../utils/dateFormatting.js';
import { GradeChip } from '../../dashboard/components/heroSectionParts.jsx';
import { IdentityStrip, IdentityCell } from '../../evaluation/components/IdentityStrip.jsx';
import RunLogPanel from './RunLogPanel.jsx';
import RunSevRow, { CRIT_MAJ, MAJOR_ONLY } from './RunSevRow.jsx';
import RunMoreMenu from './RunMoreMenu.jsx';
import RunFindings from './RunFindings.jsx';
import RunDimensions from './RunDimensions.jsx';
import { dayLabel, timeLabel, scoreText, numberText } from './runFormat.js';
import { originLabel, originUrl } from './runLogModel.js';

const TAB_DIMS = 'dimensions';
const TAB_NEW = 'new';
const TAB_RESOLVED = 'resolved';
const OTHER_MODEL = 'other-model';
const RATE_ROUND_FROM = 10;

const stamp = (iso) => `${dayLabel(iso)} ${timeLabel(iso)}`;
const rateText = (n) => (n >= RATE_ROUND_FROM ? Math.round(n).toString() : n.toFixed(1));

function severityDeltas(run, baseline) {
  if (!baseline) return null;
  return { critical: run.critical - baseline.critical, major: run.majors - baseline.majors };
}

function filesCell(throughput) {
  if (!(throughput?.files > 0)) return null;
  const rate = throughput.perMin != null ? ` · ${t('history.perMin', { rate: rateText(throughput.perMin) })}` : '';
  return `${numberText(throughput.files)}${rate}`;
}

function Hero({ run, baseline, onOpenRun, onDelete }) {
  const url = originUrl(run.origin);
  return (
    <div className="rl-hero">
      <GradeChip score={run.score} grade={run.grade} />
      <span className={`rl-hero__score ${scoreColorClass(run.score)}`}>{scoreText(run.score)}</span>
      <span className="rl-hero__open">{t('history.openCount', { count: numberText(run.open) })}</span>
      <RunSevRow counts={{ critical: run.critical, major: run.majors }} deltas={severityDeltas(run, baseline)} levels={CRIT_MAJ} />
      <span className="rl-hero__actions">
        <button type="button" className="eval-scan-pill" onClick={() => onOpenRun(run)}><span className="eval-scan-pill__glyph" aria-hidden="true">▶</span>{t('history.openRun')}</button>
        {url && <a className="eval-pill-btn" href={url} target="_blank" rel="noreferrer" title={t('history.openGitHubTitle')}>{t('history.openGitHub')}</a>}
        <RunMoreMenu onDelete={() => onDelete(run.runId, stamp(run.startedAt))} />
      </span>
    </div>
  );
}

function Identity({ run, throughput }) {
  const cells = [
    [t('history.idCommit'), run.commit],
    [t('history.idTook'), run.activeSeconds > 0 ? formatDurationCoarse(run.activeSeconds) : null],
    [t('history.idFiles'), filesCell(throughput)],
  ].filter(([, v]) => v);
  if (!cells.length) return null;
  return <IdentityStrip>{cells.map(([k, v]) => <IdentityCell key={k} label={k}>{v}</IdentityCell>)}</IdentityStrip>;
}

function Tab({ id, active, count, empty = false, cls, label, sev, onTab }) {
  return (
    <button type="button" role="tab" aria-selected={active} className="rl-tab" disabled={empty} onClick={() => onTab(id)}>
      <span className="rl-tab__big"><span className={empty ? 'rl-zero' : cls}>{count}</span> <span className="rl-tab__lbl">{label}</span></span>
      {sev && <RunSevRow counts={sev} levels={MAJOR_ONLY} />}
    </button>
  );
}

function Foot({ run, baseline, diff }) {
  if (!baseline) return <span>{t('history.noBaseline')}</span>;
  const origin = originLabel(baseline.origin);
  const params = { date: stamp(baseline.startedAt), origin: origin ? ` ${origin}` : '', model: run.model || '' };
  const text = run.baselineKind === OTHER_MODEL ? t('history.vsOtherModel', params) : t('history.vsSameModel', params);
  return (
    <span>{text}{diff?.unchecked > 0 && <> · <span className="rl-help" title={t('history.notRecheckedTitle')}>{t('history.notRechecked', { count: diff.unchecked })}</span></>}</span>
  );
}

/** Which tab shows, and the findings list (if any) with how many are not in it. */
function tabView(run, diff, tab) {
  const lists = { [TAB_NEW]: diff?.new, [TAB_RESOLVED]: diff?.resolved };
  const list = lists[tab]?.length ? lists[tab] : null;
  const total = tab === TAB_RESOLVED ? run.counts?.resolved : run.counts?.new;
  return {
    active: list ? tab : TAB_DIMS,
    list,
    nNew: diff?.new.length || 0,
    nResolved: diff?.resolved.length || 0,
    more: list && total > list.length ? total - list.length : 0,
  };
}

function Tabs({ run, diff, view, onTab }) {
  return (
    <div className="rl-tabs" role="tablist">
      <Tab id={TAB_DIMS} active={view.active === TAB_DIMS} count={run.dims.length} label={t('history.tabDimensions')} onTab={onTab} />
      {diff && <Tab id={TAB_NEW} active={view.active === TAB_NEW} count={`+${view.nNew}`} empty={!view.nNew} cls="rl-new" label={t('history.tabNew')} sev={diff.newSev} onTab={onTab} />}
      {diff && <Tab id={TAB_RESOLVED} active={view.active === TAB_RESOLVED} count={`−${view.nResolved}`} empty={!view.nResolved} cls="rl-fixed" label={t('history.tabResolved')} sev={diff.resolvedSev} onTab={onTab} />}
    </div>
  );
}

/** The selected run: hero, identity, tabs and the dimensions or findings body. */
export default function RunDetail({ run, baseline, diff, throughput, tab, onTab, onOpenRun, onOpenFinding, onOpenDimension, onDelete }) {
  const view = tabView(run, diff, tab);
  const resolved = view.active === TAB_RESOLVED;
  const head = [originLabel(run.origin), run.model].filter(Boolean).join(' · ');
  return (
    <RunLogPanel label={t('history.runLabel', { date: stamp(run.startedAt) })} stats={head} className="rl-detail" foot={<Foot run={run} baseline={baseline} diff={diff} />}>
      <div className="rl-detail__body">
        <Hero run={run} baseline={baseline} onOpenRun={onOpenRun} onDelete={onDelete} />
        <Identity run={run} throughput={throughput} />
        <Tabs run={run} diff={diff} view={view} onTab={onTab} />
        <div className="rl-body">
          {view.list
            ? <RunFindings list={view.list} onOpen={(f) => (resolved ? onOpenFinding(f, baseline, run) : onOpenFinding(f, run, null))} />
            : <RunDimensions run={run} diff={diff} onOpen={onOpenDimension} />}
          {view.more > 0 && <div className="rl-more-findings">{t('history.moreFindings', { count: numberText(view.more) })}</div>}
        </div>
      </div>
    </RunLogPanel>
  );
}
