import { useQuery } from '@tanstack/react-query';
import SectionLabel from '../../../components/terminal/SectionLabel.jsx';
import ServerStatusRow, { SERVER_ROW_STATUS } from '../../../components/ServerStatusRow.jsx';
import HelpHint from '../../../components/HelpHint.jsx';
import { useServerLog } from '../server-log/ServerLogContext.js';
import { systemKeys } from '../../../api/queryKeys.js';
import { getHealth } from '../../../api/index.js';
import { t } from '../../../strings/index.js';
import { tRich } from '../../../strings/rich.jsx';

const LOCAL_SERVER_HINT = t('settings.localServerHint');

const HEALTH_POLL_MS = 10000;

export default function ServerSection() {
  const serverLog = useServerLog();

  const { data: health, isLoading } = useQuery({
    queryKey: [...systemKeys.health(), 'settings-detail'],
    queryFn: () => getHealth().then((d) => (d?.ok ? d : null)).catch((err) => {
      // An unreachable server reads as "no health", which the section shows as offline.
      console.debug('[ServerSection] health check failed:', err);
      return null;
    }),
    refetchInterval: HEALTH_POLL_MS,
    refetchOnWindowFocus: false,
  });

  const status = health
    ? SERVER_ROW_STATUS.ONLINE
    : (isLoading ? SERVER_ROW_STATUS.CHECKING : SERVER_ROW_STATUS.OFFLINE);

  return (
    <section className="panel settings-section">
      <div className="panel-header">
        <span className="settings-label-row">
          <SectionLabel marker="▶">{t('settings.localServerLabel')}</SectionLabel>
          <HelpHint label={t('settings.localServerHelpAria')}>{LOCAL_SERVER_HINT}</HelpHint>
        </span>
      </div>

      <ServerStatusRow
        title={t('settings.quodeqServerLabel')}
        status={status}
        address={health?.address}
        facts={[[t('settings.serverVersionLabel'), health?.version], [t('settings.serverPidLabel'), health?.pid]]}
        offlineMessage={<span>{tRich('settings.restartDesc')}</span>}
        onToggleConsole={() => (serverLog.open ? serverLog.closeLog() : serverLog.openLog())}
        consoleOpen={serverLog.open}
      />
    </section>
  );
}
