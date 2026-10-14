import { useCallback, useRef, useState } from 'react';
import { useDismissOnOutside } from '../../../../hooks/useDismissOnOutside.js';
import Icon from '../../../../components/Icon.jsx';
import { t } from '../../../../strings/index.js';
import { PLAYBACK_SPEEDS } from '../../model/timelapsePlayback.js';
import { GRANULARITY } from '../../../../utils/granularity.js';

const SMALL_ICON = 14;
const PLAY_ICON = 16;
const PERIODS = Object.freeze([GRANULARITY.DAY, GRANULARITY.WEEK, GRANULARITY.MONTH]);
const PERIOD_KEY = {
  [GRANULARITY.DAY]: 'map.timelapsePeriodDay', [GRANULARITY.WEEK]: 'map.timelapsePeriodWeek', [GRANULARITY.MONTH]: 'map.timelapsePeriodMonth',
};
const STEP_BACK = -1;
const STEP_FORWARD = 1;

const GLYPHS = {
  first: <><path d="M6 5v14" /><path d="M18 6 9 12l9 6z" fill="currentColor" /></>,
  back: <path d="M15 6l-6 6 6 6" />,
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" strokeLinejoin="round" />,
  pause: <><path d="M8 5v14" strokeWidth="3" /><path d="M16 5v14" strokeWidth="3" /></>,
  forward: <path d="M9 6l6 6-6 6" />,
  latest: <><path d="M18 5v14" /><path d="M6 6l9 6-9 6z" fill="currentColor" /></>,
};

function IconButton({ glyph, label, onClick, size = SMALL_ICON, className = 'map-timelapse__icon-btn' }) {
  return (
    <button type="button" className={className} onClick={onClick} aria-label={label} title={label}>
      <Icon size={size}>{GLYPHS[glyph]}</Icon>
    </button>
  );
}

/** First, one back, play or pause (the main control), one forward, today. */
export function Transport({ playing, controls }) {
  return (
    <div className="map-timelapse__transport">
      <IconButton glyph="first" label={t('map.timelapseFirst')} onClick={controls.first} />
      <IconButton glyph="back" label={t('map.timelapseStepBack')} onClick={() => controls.step(STEP_BACK)} />
      <IconButton glyph={playing ? 'pause' : 'play'} label={t(playing ? 'map.timelapsePause' : 'map.timelapsePlay')}
        onClick={controls.toggle} size={PLAY_ICON} className="map-timelapse__play" />
      <IconButton glyph="forward" label={t('map.timelapseStepForward')} onClick={() => controls.step(STEP_FORWARD)} />
      <IconButton glyph="latest" label={t('map.timelapseLatest')} onClick={controls.latest} />
    </div>
  );
}

function Choices({ label, options, value, labelOf, onPick }) {
  return (
    <div className="map-timelapse__choice">
      <span className="map-timelapse__choice-label">{label}</span>
      <div className="term-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" className={`term-btn${o === value ? ' term-btn--on' : ''}`} aria-pressed={o === value} onClick={() => onPick(o)}>
            {labelOf(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One small button ("Week · 1×") opening the grouping and the speed. */
export function PlaySettings({ period, setPeriod, speed, setSpeed }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const trigger = useRef(null);
  // Closing hands focus back to the button, so a keyboard user is not dropped on the page.
  const close = useCallback(() => {
    setOpen(false);
    if (ref.current?.contains(document.activeElement)) trigger.current?.focus();
  }, []);
  useDismissOnOutside(open, ref, close);
  const summary = t('map.timelapseSettingsSummary', { period: t(PERIOD_KEY[period]), speed: t('map.timelapseSpeed', { n: speed }) });
  return (
    <div className="map-timelapse__settings" ref={ref}>
      <button ref={trigger} type="button" className="term-btn map-timelapse__settings-btn" aria-expanded={open} aria-haspopup="true"
        aria-label={t('map.timelapseSettingsAria', { summary })} onClick={() => setOpen((v) => !v)}>
        {summary} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="map-timelapse__menu" role="group" aria-label={t('map.timelapseSettingsAria', { summary })}>
          {setPeriod && <Choices label={t('map.timelapsePeriodAria')} options={PERIODS} value={period} labelOf={(p) => t(PERIOD_KEY[p])} onPick={setPeriod} />}
          <Choices label={t('map.timelapseSpeedAria')} options={PLAYBACK_SPEEDS} value={speed} labelOf={(s) => t('map.timelapseSpeed', { n: s })} onPick={setSpeed} />
        </div>
      )}
    </div>
  );
}
