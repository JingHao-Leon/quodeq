import ConsoleButton from './ConsoleButton.jsx';
import { t } from '../strings/index.js';

/** The three states a polled local server shows. */
export const SERVER_ROW_STATUS = Object.freeze({ ONLINE: 'online', OFFLINE: 'offline', CHECKING: 'checking' });

const STATE_KEY = {
  [SERVER_ROW_STATUS.ONLINE]: 'settings.serverRunning',
  [SERVER_ROW_STATUS.OFFLINE]: 'settings.serverUnreachable',
  [SERVER_ROW_STATUS.CHECKING]: 'settings.checkingEllipsis',
};

function CopyAddress({ address }) {
  if (!address) return null;
  const copy = () => {
    navigator.clipboard?.writeText(address).catch((err) => console.debug('[ServerStatusRow] copy failed:', err));
  };
  return (
    <button type="button" className="server-row__address" onClick={copy}
      aria-label={t('settings.copyAddress', { address })} title={t('settings.copyAddressTitle')}>
      {address}
    </button>
  );
}

// Only the facts the server actually reported: a missing value hides its label too.
function Facts({ facts }) {
  const shown = facts.filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (shown.length === 0) return null;
  return (
    <div className="server-row__facts">
      {shown.map(([label, value]) => <span key={label}>{label} <b>{value}</b></span>)}
    </div>
  );
}

/**
 * One local server as a settings row: its name and address on the left, its
 * state and the console on the right; while it runs, the facts it reported
 * as a caption; while it is down, how to start it.
 * @param {object} props
 * @param {string} props.title - the row's name ("Server", "Quodeq server")
 * @param {'online'|'offline'|'checking'} props.status
 * @param {string|null} [props.address] - host:port, copied on click
 * @param {Array<[string, string|number|undefined]>} [props.facts] - [label, value] pairs
 * @param {React.ReactNode} [props.offlineMessage] - how to start the server
 * @param {() => void} [props.onToggleConsole]
 * @param {boolean} [props.consoleOpen]
 * @param {boolean} [props.showDot]
 */
export default function ServerStatusRow({
  title, status, address = null, facts = [], offlineMessage = null,
  onToggleConsole, consoleOpen = false, showDot = false,
}) {
  const online = status === SERVER_ROW_STATUS.ONLINE;
  const offline = status === SERVER_ROW_STATUS.OFFLINE;
  return (
    <div className={`server-row server-row--${status}`}>
      <div className="server-row__name">
        <span className="settings-label">{title}</span>
        <CopyAddress address={address} />
      </div>
      <div className="server-row__state">
        <span className="server-row__status" role="status">
          <span className="server-row__dot" aria-hidden="true" />
          {t(STATE_KEY[status])}
        </span>
        {online && typeof onToggleConsole === 'function' && (
          <ConsoleButton open={consoleOpen} onToggle={onToggleConsole} showDot={showDot} />
        )}
      </div>
      {online && <Facts facts={facts} />}
      {offline && (
        <div className="server-row__help">
          {offlineMessage}
          <span className="server-row__recheck">{t('settings.serverRecheck')}</span>
        </div>
      )}
    </div>
  );
}
