import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000').trim().replace(/\/+$/, '');
const POLL_MS = 2500;

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {}),
    },
  });
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`API returned non-JSON response (HTTP ${response.status}). Check the backend URL.`); }
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `Request failed (HTTP ${response.status})`);
  }
  return body;
}

const fmt = (value, digits = 2) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
};
const time = (value) => {
  if (!value) return 'No reading yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const dateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : `${date.toLocaleDateString()} ${time(value)}`;
};

function Icon({ name, size = 19 }) {
  const base = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></>,
    pulse: <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    setup: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.3 1-1.4 2.4-1.5-.6a8 8 0 0 1-1.8 1l-.2 1.6h-2.8l-.3-1.6a8 8 0 0 1-1.8-1l-1.5.6-1.4-2.4 1.3-1.1a7 7 0 0 1 0-2l-1.3-1 1.4-2.5 1.5.6a8 8 0 0 1 1.8-1l.3-1.6h2.8l.2 1.6a8 8 0 0 1 1.8 1l1.5-.6 1.4 2.5-1.3 1a7 7 0 0 1 0 2Z"/></>,
    bolt: <><path d="m13 2-3 8h7l-6 12 2-9H6l7-11Z"/></>,
    gauge: <><path d="M12 14l4-4"/><path d="M3.5 17a9 9 0 1 1 17 0"/><path d="M6 17h12"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    wifi: <><path d="M5 9a11 11 0 0 1 14 0"/><path d="M8 12a6.5 6.5 0 0 1 8 0"/><path d="M11 15a2 2 0 0 1 2 0"/><path d="M12 19h.01"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.5-3"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    activity: <><path d="M4 19V5M4 19h16"/><path d="m7 15 4-5 3 2 5-7"/></>,
    cable: <><path d="M7 3v5M17 3v5M5 8h14v3a7 7 0 0 1-14 0V8ZM12 18v3"/></>,
  };
  return <svg {...base}>{paths[name] || paths.pulse}</svg>;
}

function MetricCard({ label, value, unit, icon, accent, note }) {
  return <article className={`metric-card accent-${accent}`}>
    <div className="metric-heading"><span>{label}</span><span className="metric-icon"><Icon name={icon} size={19}/></span></div>
    <div className="metric-value">{value}<small>{unit}</small></div>
    <div className="metric-note"><span className="mini-dot"/>{note}</div>
  </article>;
}

function StatusBadge({ status }) {
  const current = status || 'WAITING';
  const label = current === 'ALERT' ? 'Possible anomaly' : current === 'CHECK_SENSOR' ? 'Check sensors' : current === 'NORMAL' ? 'Normal' : 'Awaiting data';
  return <span className={`status-badge badge-${current.toLowerCase()}`}><i/>{label}</span>;
}

function TrendChart({ history }) {
  const rows = [...history].reverse().slice(-24);
  if (rows.length < 2) return <div className="chart-empty"><div className="empty-graphic"><Icon name="activity" size={27}/></div><strong>Building the live trend</strong><span>At least two readings are needed to draw a line. Start the Wokwi simulation.</span></div>;
  const max = Math.max(1, ...rows.flatMap(r => [Number(r.sensor_a_amps) || 0, Number(r.sensor_b_amps) || 0])) * 1.15;
  const x = (index) => 34 + (index * 610) / Math.max(rows.length - 1, 1);
  const y = (value) => 192 - ((Number(value) || 0) / max) * 155;
  const pointString = (key) => rows.map((r, i) => `${x(i)},${y(r[key])}`).join(' ');
  return <div className="chart-wrap">
    <div className="chart-legend"><span><i className="legend-input"/>Input current</span><span><i className="legend-consumer"/>Consumer current</span></div>
    <svg className="chart-svg" viewBox="0 0 680 230" role="img" aria-label="Input and consumer current history chart">
      {[42, 82, 122, 162, 202].map((gy, i) => <g key={gy}><line x1="30" y1={gy} x2="650" y2={gy} className="chart-grid-line"/><text x="3" y={gy + 4} className="chart-axis-label">{fmt(max * (4 - i) / 4, 1)}</text></g>)}
      <polyline points={pointString('sensor_a_amps')} className="chart-line line-input" />
      <polyline points={pointString('sensor_b_amps')} className="chart-line line-consumer" />
      <circle cx={x(rows.length - 1)} cy={y(rows[rows.length - 1].sensor_a_amps)} r="4" className="chart-point input-point"/>
      <circle cx={x(rows.length - 1)} cy={y(rows[rows.length - 1].sensor_b_amps)} r="4" className="chart-point consumer-point"/>
    </svg>
    <div className="chart-footer"><span>{time(rows[0].received_at)}</span><span>Last {rows.length} readings</span><span>{time(rows[rows.length - 1].received_at)}</span></div>
  </div>;
}

function ReadingTable({ rows, compact = false }) {
  const data = compact ? rows.slice(0, 7) : rows;
  return <div className="table-wrap"><table><thead><tr><th>Time received</th><th>Input</th><th>Consumer</th><th>Gap</th><th>Gap %</th><th>Status</th></tr></thead><tbody>
    {data.map((row, i) => <tr key={`${row.received_at}-${i}`}>
      <td className="time-col">{time(row.received_at)}</td><td>{fmt(row.sensor_a_amps)} <em>A</em></td><td>{fmt(row.sensor_b_amps)} <em>A</em></td><td className="gap-col">{fmt(row.gap_amps)} <em>A</em></td><td>{fmt(row.gap_percent, 1)}<em>%</em></td><td><StatusBadge status={row.status}/></td>
    </tr>)}
  </tbody></table>{data.length === 0 && <div className="empty-state"><div className="empty-graphic"><Icon name="clock" size={24}/></div><strong>No readings received yet</strong><span>Start the Flask API and Wokwi simulation to stream data.</span></div>}</div>;
}

function SetupPanel({ apiOnline, refresh }) {
  return <div className="setup-grid">
    <section className="panel setup-panel">
      <div className="section-title"><span className="eyebrow">END-TO-END FLOW</span><h2>How the prototype works</h2><p>The same reading travels from the Wokwi simulator through Python into this React dashboard.</p></div>
      <div className="flow-list">
        {[['01','Virtual sensors','Two Wokwi potentiometers simulate upstream and consumer current.','cable'],['02','ESP32 calculation','ESP32 estimates current, gap and alert status, then prints values in Serial Monitor.','activity'],['03','Python Flask API','POST /api/readings receives the packet, validates it and stores recent readings in memory.','setup'],['04','React dashboard','The dashboard polls the API every 2.5 seconds and updates metrics, graph and history.','grid']].map(([n,title,desc,icon]) => <div className="flow-item" key={n}><div className="flow-number">{n}</div><div className="flow-icon"><Icon name={icon}/></div><div className="flow-copy"><strong>{title}</strong><p>{desc}</p></div></div>)}
      </div>
    </section>
    <section className="panel connection-panel">
      <div className="section-title"><span className="eyebrow">CONFIGURATION</span><h2>Connection checklist</h2></div>
      <div className="check-row"><span className={`check-circle ${apiOnline ? 'good' : ''}`}>{apiOnline ? '✓' : '1'}</span><div><strong>Python API</strong><p>{apiOnline ? 'Connected at ' + API_BASE : 'Start backend/app.py on port 5000.'}</p></div><span className={`health-tag ${apiOnline ? 'up' : 'down'}`}>{apiOnline ? 'ONLINE' : 'OFFLINE'}</span></div>
      <div className="check-row"><span className="check-circle">2</span><div><strong>Public tunnel</strong><p>Run ngrok/cloudflared for port 5000. Copy the HTTPS URL.</p></div></div>
      <div className="check-row"><span className="check-circle">3</span><div><strong>Wokwi sketch URL</strong><p>Set BACKEND_URL to the tunnel URL ending with <code>/api/readings</code>.</p></div></div>
      <div className="check-row"><span className="check-circle">4</span><div><strong>Serial Monitor</strong><p>Look for HTTP status <code>201</code> after a reading is posted.</p></div></div>
      <div className="config-note"><Icon name="shield"/><p><strong>Prototype safety note</strong><br/>Potentiometers simulate current. They do not measure real electricity. A discrepancy is an investigation signal, not proof of theft.</p></div>
      <button className="button-secondary full-button" onClick={refresh}><Icon name="refresh" size={16}/> Check API connection</button>
    </section>
  </div>;
}

export default function LiveGridSentinel({ page = 'overview' }) {
  const [apiOnline, setApiOnline] = useState(false);
  const [reading, setReading] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [lastHealth, setLastHealth] = useState(null);

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [healthJson, latestJson, historyJson] = await Promise.all([
        api('/api/health'), api('/api/readings/latest'), api('/api/readings?limit=40'),
      ]);
      setApiOnline(Boolean(healthJson.ok));
      setLastHealth(healthJson);
      setReading(latestJson.data || null);
      setHistory(Array.isArray(historyJson.data) ? historyJson.data : []);
      setLastSync(new Date());
      setError('');
    } catch (err) {
      setApiOnline(false);
      setError(err?.message || 'Cannot reach the Flask API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timerId = window.setInterval(() => refresh(), POLL_MS);
    return () => window.clearInterval(timerId);
  }, [refresh]);

  const sendTestPacket = async () => {
    setTestSending(true);
    try {
      await api('/api/demo/sample', { method: 'POST', body: JSON.stringify({}) });
      await refresh();
    } catch (err) {
      setError(err?.message || 'Could not send the test packet.');
    } finally {
      setTestSending(false);
    }
  };

  const alertCount = useMemo(() => history.filter(r => r.status === 'ALERT' || r.alert === true).length, [history]);
  const isAlert = reading?.status === 'ALERT' || reading?.alert === true;
  const checkSensor = reading?.status === 'CHECK_SENSOR';
  const input = Number(reading?.sensor_a_amps) || 0;
  const consumer = Number(reading?.sensor_b_amps) || 0;
  const gap = Number(reading?.gap_amps) || 0;
  const gapPercent = Number(reading?.gap_percent) || 0;
  const source = reading?.source || '';
  const isLocalTest = source === 'LOCAL_TEST_NOT_WOKWI';
  const ageSeconds = reading?.received_at ? Math.max(0, Math.floor((Date.now() - new Date(reading.received_at).getTime()) / 1000)) : null;
  const streamFresh = ageSeconds !== null && ageSeconds <= 10;
  const heading = { overview: ['Live monitoring', 'Current balance, signal health and newest Wokwi readings.'], telemetry: ['Telemetry readings', 'Inspect recent values received and calculated by the Python API.'], alerts: ['Alert review', 'Review unusual current gaps and sensor-direction warnings.'], setup: ['Prototype setup', 'Connect the simulator, backend and dashboard in order.'] }[page] || ['Live monitoring', 'Current balance and signal health.'];
  const displayRows = page === 'alerts' ? history.filter(row => row.status !== 'NORMAL') : history;
  const displayLabel = page === 'alerts' ? 'Recent alerts & checks' : 'Recent telemetry';

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-symbol"><Icon name="pulse" size={23}/></div><div><strong>Grid<span>Sentinel</span></strong><small>GRID INTELLIGENCE</small></div></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        <NavLink to="/" end className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}><Icon name="grid"/><span>Overview</span></NavLink>
        <NavLink to="/telemetry" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}><Icon name="pulse"/><span>Telemetry</span><span className="nav-count">{history.length}</span></NavLink>
        <NavLink to="/alerts" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}><Icon name="alert"/><span>Alerts & checks</span>{alertCount > 0 && <span className="nav-alert-count">{alertCount}</span>}</NavLink>
        <NavLink to="/setup" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}><Icon name="setup"/><span>Setup guide</span></NavLink>
      </nav>
      <div className="sidebar-bottom">
        <div className="prototype-card"><div className="prototype-head"><div className="prototype-icon"><Icon name="shield" size={17}/></div><span>PROTOTYPE MODE</span></div><strong>Simulated sensor input</strong><p>Wokwi potentiometers stand in for current sensors during this demo.</p><div className="sim-label"><span/> EDUCATIONAL SIMULATION</div></div>
        <div className="sidebar-foot"><span className="sidebar-pip"/> Embedded IoT prototype <span className="version-tag">v1.0</span></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs">GridSentinel <span>/</span> <strong>{page === 'overview' ? 'Overview' : page === 'telemetry' ? 'Telemetry' : page === 'alerts' ? 'Alerts & checks' : 'Setup guide'}</strong></div><div className="topbar-actions"><span className="environment-tag">DEVELOPMENT ENVIRONMENT</span><div className={`api-chip ${apiOnline ? 'online' : 'offline'}`}><span/>{apiOnline ? 'API connected' : 'API offline'}</div><button className="icon-button" aria-label="Refresh dashboard" title="Refresh now" onClick={() => refresh(true)} disabled={loading}><span className={loading ? 'spin' : ''}><Icon name="refresh" size={17}/></span></button></div></header>

      <section className="page-heading"><div><div className="eyebrow"><span className="live-pulse"/> DISTRIBUTION LINE MONITORING</div><h1>{heading[0]}<span>.</span></h1><p>{heading[1]}</p></div><div className="heading-tools"><button className="button-secondary test-button" onClick={sendTestPacket} disabled={!apiOnline || testSending} title="Creates a clearly labelled local test sample, not a Wokwi reading"><Icon name="pulse" size={15}/>{testSending ? 'Sending test…' : 'Send test packet'}</button><div className="sync-box"><span>LAST SYNC</span><strong>{lastSync ? time(lastSync.toISOString()) : 'Not synced'}</strong><small>Auto-refresh · {POLL_MS / 1000}s</small></div></div></section>

      {error && <div className="error-banner"><div className="error-mark">!</div><div><strong>Backend connection problem</strong><p>{error}</p><small>API base URL: {API_BASE}</small></div><button onClick={() => refresh(true)}>Retry <Icon name="arrow" size={15}/></button></div>}

      <section className={`status-banner ${isAlert ? 'danger' : checkSensor ? 'caution' : reading ? 'safe' : 'waiting'}`} aria-live="polite"><div className="banner-icon"><Icon name={isAlert ? 'alert' : checkSensor ? 'setup' : 'shield'} size={23}/></div><div className="banner-text"><strong>{!reading ? 'Waiting for the first reading' : isLocalTest ? 'Local API test packet received' : isAlert ? 'Possible current discrepancy detected' : checkSensor ? 'Check sensor direction or wiring' : 'Latest reading is below the alert threshold'}</strong><p>{!reading ? 'Start backend/app.py, expose port 5000 with a tunnel, then run Wokwi.' : isLocalTest ? 'This packet was generated by the dashboard test button, not by Wokwi. Start the simulator to replace it.' : isAlert ? 'The input-to-consumer gap crossed the demo threshold. Verify the physical layout before drawing a conclusion.' : checkSensor ? 'Consumer-side current exceeds upstream current. Check sensor orientation, mapping and readings.' : 'The backend received a reading and calculated the discrepancy.'}</p></div><div className="banner-right"><StatusBadge status={reading ? reading.status : 'WAITING'}/><small>{reading ? time(reading.received_at) : 'No telemetry yet'}</small></div></section>

      <section className="metrics-grid">
        <MetricCard label="Input current" value={reading ? fmt(input) : '—'} unit="A" icon="bolt" accent="cyan" note="SENSOR A · UPSTREAM"/>
        <MetricCard label="Consumer current" value={reading ? fmt(consumer) : '—'} unit="A" icon="pulse" accent="violet" note="SENSOR B · DOWNSTREAM"/>
        <MetricCard label="Current discrepancy" value={reading ? fmt(gap) : '—'} unit="A" icon="gauge" accent={isAlert ? 'rose' : 'mint'} note="ABSOLUTE CURRENT GAP"/>
        <MetricCard label="Gap percentage" value={reading ? fmt(gapPercent, 1) : '—'} unit="%" icon="shield" accent={isAlert ? 'rose' : 'mint'} note={`ALERT LIMIT · ${reading?.threshold_percent ?? 20}%`}/>
      </section>

      {page === 'setup' ? <SetupPanel apiOnline={apiOnline} refresh={() => refresh(true)}/> : <>
        {(page === 'overview' || page === 'telemetry') && <section className="panel trend-panel"><div className="panel-head"><div><span className="eyebrow">CURRENT OVER TIME</span><h2>Live current trend</h2><p>Input and consumer currents from the latest received packets.</p></div><div className="trend-meta"><span className={`stream-dot ${streamFresh ? 'fresh' : ''}`}/><div><strong>{streamFresh ? 'Stream active' : reading ? 'Stream stale' : 'Waiting for data'}</strong><small>{reading ? `${ageSeconds}s since last packet` : 'No packets received'}</small></div></div></div><TrendChart history={history}/></section>}

        {page === 'overview' && <section className="overview-lower">
          <div className="panel balance-panel"><div className="panel-head"><div><span className="eyebrow">LATEST SAMPLE</span><h2>Current balance</h2><p>Compare upstream input with measured consumer current.</p></div><span className="unit-pill">AMPERES</span></div>
            <div className="balance-meter"><div className="balance-title"><span><i className="swatch swatch-input"/> Input current</span><strong>{reading ? fmt(input) + ' A' : '—'}</strong></div><div className="meter-track"><div className="meter-fill fill-input" style={{width: `${reading ? Math.min(100, input / Math.max(input, consumer, 0.01) * 100) : 0}%`}}/></div></div>
            <div className="balance-meter"><div className="balance-title"><span><i className="swatch swatch-consumer"/> Consumer current</span><strong>{reading ? fmt(consumer) + ' A' : '—'}</strong></div><div className="meter-track"><div className="meter-fill fill-consumer" style={{width: `${reading ? Math.min(100, consumer / Math.max(input, consumer, 0.01) * 100) : 0}%`}}/></div></div>
            <div className="gap-summary"><div><span>Unmatched current</span><strong>{reading ? fmt(gap) : '—'} <small>A</small></strong></div><div className="gap-separator"/><div><span>Share of input</span><strong>{reading ? fmt(gapPercent, 1) : '—'}<small>%</small></strong></div></div>
            <p className="panel-note">A discrepancy is a signal to investigate, not proof of power theft. Legitimate branches and meter errors must be considered.</p>
          </div>
          <div className="panel health-panel"><div className="panel-head"><div><span className="eyebrow">SYSTEM STATUS</span><h2>Connection health</h2></div><div className={`health-icon ${apiOnline ? 'is-up' : 'is-down'}`}><Icon name="wifi" size={18}/></div></div>
            <div className="health-row"><div className="health-row-icon"><Icon name="setup" size={17}/></div><div className="health-row-copy"><strong>Python Flask API</strong><small>{apiOnline ? 'Responding to requests' : 'Not reachable'}</small></div><span className={`health-state ${apiOnline ? 'up' : 'down'}`}>{apiOnline ? 'ONLINE' : 'OFFLINE'}</span></div>
            <div className="health-row"><div className="health-row-icon"><Icon name="pulse" size={17}/></div><div className="health-row-copy"><strong>Wokwi data stream</strong><small>{reading ? `${source.replaceAll('_', ' ')} · ${time(reading.received_at)}` : 'Waiting for first POST'}</small></div><span className={`health-state ${streamFresh ? 'up' : 'idle'}`}>{streamFresh ? 'ACTIVE' : 'IDLE'}</span></div>
            <div className="health-row"><div className="health-row-icon"><Icon name="clock" size={17}/></div><div className="health-row-copy"><strong>Dashboard polling</strong><small>Refresh interval</small></div><span className="health-state up">2.5 SEC</span></div>
            <div className="connection-foot"><div className="connection-foot-icon"><Icon name="shield" size={17}/></div><p><strong>Demo rules</strong><br/>Threshold: 20% gap and at least 0.25 A. The server recalculates status from sensor values.</p></div>
          </div>
        </section>}

        {(page === 'overview' || page === 'telemetry' || page === 'alerts') && <section className="panel readings-panel"><div className="panel-head"><div><span className="eyebrow">DEVICE DATA</span><h2>{displayLabel}</h2><p>{page === 'alerts' ? 'Non-normal readings, including possible discrepancies and sensor checks.' : 'Most recent packets received by the API.'}</p></div><div className="table-actions"><span className="record-count">{displayRows.length} RECORDS</span><button className="button-secondary" onClick={() => refresh(true)} disabled={loading}><Icon name="refresh" size={15}/> Refresh</button></div></div><ReadingTable rows={displayRows} compact={page === 'overview'}/></section>}
      </>}

      <footer className="page-footer"><span>GRIDSENTINEL <i>·</i> LIVE IOT DEMO</span><span><b className={streamFresh ? 'footer-live' : ''}/>{streamFresh ? 'RECENT DATA RECEIVED' : 'AWAITING WOKWI DATA'} <i>·</i> {lastHealth?.received_count ?? 0} PACKETS SINCE API START</span></footer>
    </main>
  </div>;
}
