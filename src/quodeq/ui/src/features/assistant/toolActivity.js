import { MESSAGE_ROLE } from './messageRole.js';
import { TOOL_KIND } from '../../vocab/toolKind.js';
import { TOOL_STATUS } from '../../vocab/toolStatus.js';
import { t } from '../../strings/index.js';

// Run ids read as their first eight characters, as the History tab shows them.
const RUN_ID_CHARS = 8;

const isTool = (m) => m.role === MESSAGE_ROLE.TOOL;

// Frames persisted before calls carried structured args hold an 80-char JSON
// summary; when it is still whole it reads as the args.
function argsFromSummary(summary) {
  if (typeof summary !== 'string' || !summary.startsWith('{')) return undefined;
  try {
    return JSON.parse(summary);
  } catch (err) {
    console.warn('[toolActivity] tool args summary is not whole JSON:', err);
    return undefined;
  }
}
const isRunning = (m) => isTool(m) && m.status === TOOL_STATUS.RUNNING;

/**
 * The transcript with one tool_call frame merged in. A start frame appends a
 * running line; the end frame with the same callId settles that line's
 * status and duration; a frame without a status (older, persisted) is a
 * finished line on its own.
 */
export function withToolFrame(prev, frame) {
  const status = frame.status ?? TOOL_STATUS.OK;
  if (frame.callId && status !== TOOL_STATUS.RUNNING) {
    const idx = prev.findLastIndex((m) => isTool(m) && m.callId === frame.callId);
    if (idx >= 0) {
      const next = prev.slice();
      next[idx] = { ...next[idx], status, durationMs: frame.durationMs };
      return next;
    }
  }
  return [...prev, {
    role: MESSAGE_ROLE.TOOL, callId: frame.callId, name: frame.name,
    kind: frame.kind ?? TOOL_KIND.QUODEQ, status, args: frame.args ?? argsFromSummary(frame.argsSummary),
    argsSummary: frame.argsSummary, durationMs: frame.durationMs,
  }];
}

/**
 * Every still-running line settled when the turn ends: `done` means they
 * finished, a stop or an error means they did not. Providers that never
 * report a tool's completion land here.
 */
export function settleRunningTools(prev, status) {
  if (!prev.some(isRunning)) return prev;
  return prev.map((m) => (isRunning(m) ? { ...m, status } : m));
}

/** Consecutive tool lines folded into one activity group; other messages stay as they are. */
export function groupToolMessages(messages) {
  const out = [];
  for (const message of messages) {
    const last = out[out.length - 1];
    if (!isTool(message)) out.push(message);
    else if (last?.group) last.items.push(message);
    else out.push({ group: true, items: [message] });
  }
  return out;
}

const shortRun = (id) => (typeof id === 'string' ? id.slice(0, RUN_ID_CHARS) : '');

function describeViolations(a) {
  if (a.dimension && a.path) return t('assistant.activity.getViolationsDimIn', { dimension: a.dimension, path: a.path });
  if (a.path) return t('assistant.activity.getViolationsIn', { path: a.path });
  if (a.dimension) return t('assistant.activity.getViolationsDim', { dimension: a.dimension });
  return t('assistant.activity.getViolations');
}

function describeCompareRuns(a) {
  if (!a.run_id) return t('assistant.activity.compareRuns');
  const against = a.against ? shortRun(a.against) : t('assistant.activity.previousRun');
  return t('assistant.activity.compareRunsWith', { run: shortRun(a.run_id), against });
}

// One human line per quodeq tool, from the arguments the call was made with.
const DESCRIBERS = {
  get_context: () => t('assistant.activity.getContext'),
  get_overview: (a) => (a.as_of
    ? t('assistant.activity.getOverviewAsOf', { run: shortRun(a.as_of) })
    : t('assistant.activity.getOverview')),
  get_scores: () => t('assistant.activity.getScores'),
  get_report: (a) => t('assistant.activity.getReport', { dimension: a.dimension ?? '' }),
  get_violations: describeViolations,
  search_findings: (a) => t('assistant.activity.searchFindings', { query: a.query ?? '' }),
  get_history: (a) => (a.dimension
    ? t('assistant.activity.getHistoryDim', { dimension: a.dimension })
    : t('assistant.activity.getHistory')),
  compare_runs: describeCompareRuns,
  compare_projects: (a) => (Array.isArray(a.projects) && a.projects.length > 1
    ? t('assistant.activity.compareProjectsCount', { count: a.projects.length })
    : t('assistant.activity.compareProjects')),
  get_dismissed: () => t('assistant.activity.getDismissed'),
  get_help: () => t('assistant.activity.getHelp'),
  get_risk_areas: () => t('assistant.activity.getRiskAreas'),
  get_principle_history: (a) => t('assistant.activity.getPrincipleHistory', { dimension: a.dimension ?? '' }),
  list_standards: () => t('assistant.activity.listStandards'),
  get_standard: (a) => t('assistant.activity.getStandard', { standard: a.standard_id ?? '' }),
  read_repo_file: (a) => t('assistant.activity.readFile', { path: a.path ?? '' }),
  list_repo_dir: (a) => (a.path
    ? t('assistant.activity.listDir', { path: a.path })
    : t('assistant.activity.listRoot')),
  draft_action: () => t('assistant.activity.draftAction'),
  search_web: (a) => t('assistant.activity.searchWeb', { query: a.query ?? '' }),
  fetch_url: (a) => t('assistant.activity.fetchUrl', { url: a.url ?? '' }),
  edit_repo_file: (a) => t('assistant.activity.editFile', { path: a.path ?? '' }),
  write_repo_file: (a) => t('assistant.activity.writeFile', { path: a.path ?? '' }),
  delete_repo_file: (a) => t('assistant.activity.deleteFile', { path: a.path ?? '' }),
  get_worktree_diff: () => t('assistant.activity.reviewChanges'),
};

/**
 * What one tool line says: a verb phrase built from the call's arguments,
 * plus a monospace detail only for tools this module has no words for.
 */
export function describeToolCall(message) {
  if (message.kind === TOOL_KIND.HARNESS) return { label: t('assistant.activity.preparing'), detail: '' };
  const args = message.args ?? argsFromSummary(message.argsSummary) ?? {};
  const describe = DESCRIBERS[message.name];
  if (describe) return { label: describe(args), detail: '' };
  const detail = message.argsSummary ?? (Object.keys(args).length > 0 ? JSON.stringify(args) : '');
  return { label: t('assistant.activity.generic', { name: message.name }), detail };
}

/** The group's own status: running while any line runs, failed if any failed, else done. */
export function groupStatus(items) {
  if (items.some(isRunning)) return TOOL_STATUS.RUNNING;
  if (items.some((m) => m.status === TOOL_STATUS.ERROR)) return TOOL_STATUS.ERROR;
  return TOOL_STATUS.OK;
}
