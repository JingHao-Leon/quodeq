import { useState } from 'react';
import { t } from '../../strings/index.js';
import { MS_PER_SECOND } from '../../utils/time.js';
import { TOOL_STATUS } from '../../vocab/toolStatus.js';
import { describeToolCall, groupStatus } from './toolActivity.js';

const SUB_SECOND_DETAIL_SECONDS = 10; // below this many seconds a duration keeps one decimal ("0.4 s")
const SUB_SECOND_DETAIL_MS = SUB_SECOND_DETAIL_SECONDS * MS_PER_SECOND;

const STATUS_TEXT = {
  [TOOL_STATUS.RUNNING]: 'assistant.activity.statusRunning',
  [TOOL_STATUS.OK]: 'assistant.activity.statusOk',
  [TOOL_STATUS.ERROR]: 'assistant.activity.statusError',
};

function formatSeconds(ms) {
  const seconds = ms / MS_PER_SECOND;
  return seconds.toFixed(ms < SUB_SECOND_DETAIL_MS ? 1 : 0);
}

function StatusGlyph({ status }) {
  return (
    <>
      <span className={`assistant-activity-glyph assistant-activity-glyph--${status}`} aria-hidden="true" />
      <span className="sr-only">{t(STATUS_TEXT[status] ?? STATUS_TEXT[TOOL_STATUS.OK])}</span>
    </>
  );
}

function Duration({ ms }) {
  if (!(ms > 0)) return null;
  return <span className="assistant-activity-meta">{t('assistant.activity.seconds', { seconds: formatSeconds(ms) })}</span>;
}

function groupTitle(status, count) {
  if (status === TOOL_STATUS.RUNNING) return t('assistant.activity.groupRunning', { count });
  return count === 1 ? t('assistant.activity.groupDoneOne') : t('assistant.activity.groupDoneMany', { count });
}

function ActivityLine({ item }) {
  const { label, detail } = describeToolCall(item);
  return (
    <li className={`assistant-activity-item assistant-activity-item--${item.status}`}>
      <StatusGlyph status={item.status} />
      <span className="assistant-activity-label">{label}</span>
      {detail && <span className="assistant-activity-detail">{detail}</span>}
      <Duration ms={item.durationMs} />
    </li>
  );
}

/**
 * Consecutive tool calls of one turn as a single activity block: a header
 * with the count, the total time and a disclosure, and one line per call
 * saying what it read in plain words. Open while a call runs, folded once
 * the model moves on; a click on the header pins it either way.
 */
export function ToolActivityGroup({ items }) {
  const status = groupStatus(items);
  const [pinnedOpen, setPinnedOpen] = useState(null);
  const open = pinnedOpen ?? status === TOOL_STATUS.RUNNING;
  const totalMs = items.reduce((sum, m) => sum + (m.durationMs || 0), 0);
  const failed = items.filter((m) => m.status === TOOL_STATUS.ERROR).length;
  return (
    <div className={`assistant-activity assistant-activity--${status}`}>
      <button
        type="button" className="assistant-activity-toggle" aria-expanded={open}
        onClick={() => setPinnedOpen(!open)}
      >
        <StatusGlyph status={status} />
        <span className="assistant-activity-title">{groupTitle(status, items.length)}</span>
        {failed > 0 && <span className="assistant-activity-failed">{t('assistant.activity.failedCount', { count: failed })}</span>}
        <Duration ms={totalMs} />
      </button>
      {open && (
        <ul className="assistant-activity-list">
          {items.map((item, index) => <ActivityLine key={item.callId ?? index} item={item} />)}
        </ul>
      )}
    </div>
  );
}
