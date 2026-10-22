import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Demo, type Evaluation, type Event, type Prediction, type Risk, type Telemetry } from "./api";

type Page = "overview" | "detection" | "simulation" | "performance" | "events";
const nav: { id: Page; title: string; short: string }[] = [
  { id: "overview", title: "Overview", short: "OV" },
  { id: "detection", title: "Detection lab", short: "DL" },
  { id: "simulation", title: "Live simulation", short: "LS" },
  { id: "performance", title: "Model performance", short: "MP" },
  { id: "events", title: "Event investigation", short: "EI" },
];
const emptyTelemetry: Telemetry = {
  file_ops_per_min: 24, write_ratio: 0.2, rename_ratio: 0.03, mean_entropy: 4.5,
  distinct_files_modified: 8, extension_change_ratio: 0.01, process_count: 2,
  burstiness: 0.12, access_denied_count: 0, suspicious_operation_count: 0,
};
const suspiciousTelemetry: Telemetry = {
  file_ops_per_min: 112, write_ratio: 0.59, rename_ratio: 0.2, mean_entropy: 5.6,
  distinct_files_modified: 48, extension_change_ratio: 0.16, process_count: 5,
  burstiness: 0.53, access_denied_count: 4, suspicious_operation_count: 3,
};
const fields: { key: keyof Telemetry; label: string; step: number; min: number; max: number }[] = [
  { key: "file_ops_per_min", label: "File operations / min", step: 1, min: 0, max: 100000 },
  { key: "write_ratio", label: "Write / modification share", step: 0.01, min: 0, max: 1 },
  { key: "rename_ratio", label: "Rename share", step: 0.01, min: 0, max: 1 },
  { key: "mean_entropy", label: "Mean entropy (0–8)", step: 0.1, min: 0, max: 8 },
  { key: "distinct_files_modified", label: "Distinct files modified", step: 1, min: 0, max: 1000000 },
  { key: "extension_change_ratio", label: "Extension change share", step: 0.01, min: 0, max: 1 },
  { key: "process_count", label: "Process count", step: 1, min: 0, max: 10000 },
  { key: "burstiness", label: "Burstiness", step: 0.01, min: 0, max: 1 },
  { key: "access_denied_count", label: "Access denied count", step: 1, min: 0, max: 1000000 },
  { key: "suspicious_operation_count", label: "Suspicious operation count", step: 1, min: 0, max: 1000000 },
];

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [events, setEvents] = useState<Event[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry>(emptyTelemetry);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [demo, setDemo] = useState<Demo>({ status: "idle", total: 0, processed: 0, events: [] });
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterRisk, setFilterRisk] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextEvents, nextEvaluation, health, nextDemo] = await Promise.all([
        api.events(), api.metrics(), api.health(), api.demo("status"),
      ]);
      setEvents(nextEvents);
      setEvaluation(nextEvaluation);
      setDemo(nextDemo);
      setConnected(health.status === "ok");
      setError("");
    } catch (reason) {
      setConnected(false);
      setError(reason instanceof Error ? reason.message : "API request failed.");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (demo.status !== "running") return;
    const timer = window.setInterval(async () => {
      try {
        const next = await api.demo("step");
        setDemo(next);
        const latest = await api.events();
        setEvents(latest);
        setError("");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Simulation request failed.");
      }
    }, 900);
    return () => window.clearInterval(timer);
  }, [demo.status]);

  const counts = useMemo(() => ({
    total: events.length,
    normal: events.filter((event) => event.risk_level === "normal").length,
    suspicious: events.filter((event) => event.risk_level === "suspicious").length,
    high_risk: events.filter((event) => event.risk_level === "high_risk").length,
  }), [events]);
  const filteredEvents = useMemo(() => events.filter((event) => {
    const matchesRisk = filterRisk === "all" || event.risk_level === filterRisk;
    const needle = search.toLowerCase();
    return matchesRisk && `${event.process_label} ${event.activity_type} ${event.explanation}`.toLowerCase().includes(needle);
  }), [events, filterRisk, search]);

  async function analyze() {
    setPrediction(null);
    setError("");
    try {
      setPrediction(await api.predict(telemetry));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analysis failed.");
    }
  }
  async function demoAction(action: "start" | "pause" | "resume" | "reset") {
    try {
      const next = await api.demo(action);
      setDemo(next);
      if (action === "start" || action === "reset") await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Simulation action failed.");
    }
  }
  const title = nav.find((item) => item.id === page)?.title ?? "Overview";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><div><strong>SENTINEL</strong><small>BEHAVIOUR ANALYSIS</small></div></div>
        <div className="side-label">WORKSPACE</div>
        <nav>{nav.map((item) => <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}><span>{item.short}</span>{item.title}</button>)}</nav>
        <div className="sidebar-bottom"><div className="connection"><i className={connected ? "connected" : ""} />{connected ? "Local API connected" : "API unavailable"}</div><p>Research prototype<br />Synthetic telemetry only</p><div className="build-tag">DEMO ENVIRONMENT · 1.0</div></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{title}</b></div><div className="top-right"><span className="local-tag"><i /> LOCAL ONLY</span><span className="user-avatar">RA</span></div></header>
        <div className="content">
          <div className="page-heading"><div><div className="eyebrow">SECURITY OPERATIONS · PROTOTYPE</div><h1>{title}</h1><p>Behaviour-based research using reproducible synthetic telemetry.</p></div><div className="live-state"><span className={connected ? "status-dot" : "status-dot offline"} />{connected ? "SYSTEM READY" : "API OFFLINE"}</div></div>
          {error && <div className="notice error-notice" role="alert"><b>Connection / request issue</b><span>{error}</span><button onClick={() => void refresh()}>Retry</button></div>}
          {page === "overview" && <Overview events={events} counts={counts} demo={demo} onNavigate={setPage} onSelect={setSelectedEvent} />}
          {page === "detection" && <Detection telemetry={telemetry} setTelemetry={setTelemetry} prediction={prediction} onAnalyze={analyze} onPreset={(value) => { setTelemetry(value); setPrediction(null); }} />}
          {page === "simulation" && <Simulation demo={demo} onAction={demoAction} />}
          {page === "performance" && <Performance evaluation={evaluation} />}
          {page === "events" && <Investigation events={filteredEvents} search={search} setSearch={setSearch} filterRisk={filterRisk} setFilterRisk={setFilterRisk} onSelect={setSelectedEvent} />}
          <footer className="footer-note">All telemetry is synthetic. Alerts are probabilistic indicators, not confirmation of compromise.</footer>
        </div>
      </main>
      {selectedEvent && <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}

function Overview({ events, counts, demo, onNavigate, onSelect }: { events: Event[]; counts: Record<string, number>; demo: Demo; onNavigate: (page: Page) => void; onSelect: (event: Event) => void }) {
  const riskValues: [Risk, number, string][] = [["normal", counts.normal, "Normal"], ["suspicious", counts.suspicious, "Suspicious"], ["high_risk", counts.high_risk, "High risk"]];
  const total = Math.max(1, counts.total);
  return <section>
    <div className="metric-grid">
      <Metric title="Events analysed" value={counts.total} caption="Recorded in this API session" accent="teal" />
      <Metric title="Normal" value={counts.normal} caption="No elevated class predicted" accent="green" />
      <Metric title="Suspicious" value={counts.suspicious} caption="Review with surrounding context" accent="amber" />
      <Metric title="High risk" value={counts.high_risk} caption="Prompt human investigation" accent="red" />
    </div>
    <div className="two-column">
      <Panel title="Risk distribution" subtitle="Current session · based on actual recorded events">
        {events.length === 0 ? <Empty text="No events yet. Analyse a sample or start the synthetic simulation." /> : <div className="distribution">
          {riskValues.map(([risk, count, label]) => <div className="distribution-row" key={risk}><div className="distribution-label"><span className={`risk-bullet ${risk}`} />{label}<b>{count}</b></div><div className="bar-track"><i className={`bar-fill ${risk}`} style={{ width: `${(count / total) * 100}%` }} /></div></div>)}
        </div>}
      </Panel>
      <Panel title="Demonstration status" subtitle="Safe synthetic event stream">
        <div className="demo-card"><div className="demo-icon">SIM</div><div><strong>{demo.status === "idle" ? "Ready to run" : demo.status[0].toUpperCase() + demo.status.slice(1)}</strong><p>{demo.processed} of {demo.total} synthetic windows processed</p></div></div>
        <div className="progress-track"><i style={{ width: `${demo.total ? (demo.processed / demo.total) * 100 : 0}%` }} /></div>
        <button className="button-secondary full-button" onClick={() => onNavigate("simulation")}>Open simulation <span>→</span></button>
      </Panel>
    </div>
    <div className="two-column lower-grid">
      <Panel title="Recent alerts" subtitle="Most recently analysed activity" action={<button className="text-button" onClick={() => onNavigate("events")}>View all →</button>}>
        {events.length === 0 ? <Empty text="Alerts will appear here after the first analysis." /> : <div className="compact-list">{events.slice(0, 5).map((event) => <button className="compact-event" key={event.event_id} onClick={() => onSelect(event)}><RiskBadge risk={event.risk_level} /><div><strong>{event.process_label}</strong><small>{event.activity_type}</small></div><time>{formatTime(event.timestamp)}</time></button>)}</div>}
      </Panel>
      <Panel title="Detection activity" subtitle="Recent event timeline">
        {events.length === 0 ? <Empty text="No timeline activity to show." /> : <div className="timeline">{events.slice(0, 5).map((event) => <div className="timeline-item" key={event.event_id}><span className={`timeline-point ${event.risk_level}`} /><div><strong>{event.process_label}</strong><p>{event.explanation}</p><small>{formatDateTime(event.timestamp)}</small></div></div>)}</div>}
      </Panel>
    </div>
  </section>;
}

function Metric({ title, value, caption, accent }: { title: string; value: number; caption: string; accent: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{title}</span><i className={`metric-mark ${accent}`} /></div><strong>{value.toLocaleString()}</strong><small>{caption}</small></div>;
}
function Panel({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  return <div className="panel"><div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>{children}</div>;
}
function Empty({ text }: { text: string }) { return <div className="empty-state"><span>—</span><p>{text}</p></div>; }
function RiskBadge({ risk }: { risk: Risk }) { return <span className={`risk-badge ${risk}`}>{risk.replace("_", " ")}</span>; }
function formatTime(value: string) { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function formatDateTime(value: string) { return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

function Detection({ telemetry, setTelemetry, prediction, onAnalyze, onPreset }: { telemetry: Telemetry; setTelemetry: (value: Telemetry) => void; prediction: Prediction | null; onAnalyze: () => void; onPreset: (value: Telemetry) => void }) {
  return <div className="two-column detection-layout">
    <Panel title="Telemetry input" subtitle="Provide a single synthetic observation window">
      <div className="preset-row"><button className="button-quiet" onClick={() => onPreset(emptyTelemetry)}>Load normal example</button><button className="button-quiet" onClick={() => onPreset(suspiciousTelemetry)}>Load suspicious example</button></div>
      <div className="form-grid">{fields.map((field) => <label className="form-field" key={field.key}><span>{field.label}</span><input type="number" min={field.min} max={field.max} step={field.step} value={telemetry[field.key]} onChange={(event) => setTelemetry({ ...telemetry, [field.key]: Number(event.target.value) })} /></label>)}</div>
      <button className="button-primary analyze-button" onClick={onAnalyze}>Analyse telemetry <span>→</span></button>
    </Panel>
    <div className="stack">
      {!prediction ? <Panel title="Analysis result" subtitle="Prediction and interpretable evidence"><div className="result-placeholder"><div className="placeholder-ring">ML</div><h3>Awaiting telemetry</h3><p>Submit the sample to see a model classification, risk score, and contributing features.</p></div></Panel> :
        <><Panel title="Analysis result" subtitle="Synthetic baseline prediction"><div className="result-top"><RiskBadge risk={prediction.label} /><div className="risk-score"><strong>{prediction.risk_score}</strong><small>/ 100 risk score</small></div></div><div className="probability-list">{Object.entries(prediction.probabilities).map(([label, value]) => <div key={label}><span>{label.replace(/_/g, " ")}</span><b>{(value * 100).toFixed(1)}%</b></div>)}</div><div className="section-subhead">Why this result</div><ul className="reason-list">{prediction.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><div className="feature-explanations">{prediction.explanation.map((item) => <div key={item.feature}><div><b>{item.feature.replace(/_/g, " ")}</b><span>{item.observed_value.toFixed(2)}</span></div><small>{item.note}</small></div>)}</div><small className="disclaimer">{prediction.disclaimer}</small></Panel>
          <Panel title="Investigation guidance" subtitle="Human review is required"><ul className="action-list">{prediction.investigation_steps.map((step) => <li key={step}>{step}</li>)}</ul><div className="section-subhead">Potential ATT&amp;CK references</div>{prediction.mitre_mappings.map((map) => <div className="mitre-item" key={map}>{map}</div>)}</Panel></>}
    </div>
  </div>;
}

function Simulation({ demo, onAction }: { demo: Demo; onAction: (action: "start" | "pause" | "resume" | "reset") => void }) {
  const percent = demo.total ? Math.round((demo.processed / demo.total) * 100) : 0;
  return <div className="stack">
    <Panel title="Synthetic activity stream" subtitle="No real files are accessed, modified, renamed, or deleted">
      <div className="simulation-banner"><div><span className="sim-pulse" /> SIMULATED TELEMETRY</div><p>This demonstration feeds generated feature windows to the same local model used by manual analysis.</p></div>
      <div className="simulation-controls">
        {demo.status === "idle" || demo.status === "completed" ? <button className="button-primary" onClick={() => onAction("start")}>{demo.status === "completed" ? "Run again" : "Start simulation"} <span>→</span></button> : null}
        {demo.status === "running" && <button className="button-secondary" onClick={() => onAction("pause")}>Pause</button>}
        {demo.status === "paused" && <button className="button-primary" onClick={() => onAction("resume")}>Resume</button>}
        {demo.status !== "idle" && <button className="button-quiet" onClick={() => onAction("reset")}>Reset</button>}
        <div className="simulation-state"><span className={`status-dot ${demo.status === "running" ? "" : "offline"}`} />{demo.status.toUpperCase()}</div>
      </div>
      <div className="progress-label"><span>Progress</span><b>{demo.processed} / {demo.total} windows · {percent}%</b></div><div className="progress-track large"><i style={{ width: `${percent}%` }} /></div>
    </Panel>
    <Panel title="Simulation event timeline" subtitle="Each row represents a synthetic observation window">
      {demo.events.length === 0 ? <Empty text="Start the simulation to populate the event timeline." /> : <div className="event-table-wrap"><table><thead><tr><th>Time</th><th>Process label</th><th>Activity</th><th>Risk</th><th>Score</th><th>Explanation</th></tr></thead><tbody>{demo.events.map((event) => <tr key={event.event_id}><td>{formatTime(event.timestamp)}</td><td className="mono">{event.process_label}</td><td>{event.activity_type}</td><td><RiskBadge risk={event.risk_level} /></td><td>{event.risk_score}</td><td className="explanation-cell">{event.explanation}</td></tr>)}</tbody></table></div>}
    </Panel>
  </div>;
}

function Performance({ evaluation }: { evaluation: Evaluation | null }) {
  if (!evaluation) return <Panel title="Evaluation unavailable" subtitle="Connect to the local API"><Empty text="Model evaluation metrics could not be loaded." /></Panel>;
  const metrics = evaluation.metrics;
  const metricLabels: [string, string][] = [["accuracy", "Accuracy"], ["macro_precision", "Macro precision"], ["macro_recall", "Macro recall"], ["macro_f1", "Macro F1"], ["normal_false_positive_rate", "Normal false-positive rate"]];
  return <div className="stack">
    <div className="notice info-notice"><b>{evaluation.selected_model}</b><span>Selected by macro F1 on a stratified synthetic test split. These figures are not real-world detection performance.</span></div>
    <div className="metric-grid performance-metrics">{metricLabels.map(([key, label]) => <div className="metric-card" key={key}><div className="metric-top"><span>{label}</span><i className="metric-mark teal" /></div><strong>{(metrics[key] * 100).toFixed(1)}<small>%</small></strong><div className="mini-track"><i style={{ width: `${metrics[key] * 100}%` }} /></div></div>)}</div>
    <div className="two-column">
      <Panel title="Confusion matrix" subtitle="Actual rows × predicted columns">
        <div className="matrix-wrap"><div className="matrix-labels"><span></span>{evaluation.classes.map((name) => <b key={name}>{name}</b>)}</div>{evaluation.confusion_matrix.map((row, index) => <div className="matrix-row" key={evaluation.classes[index]}><b>{evaluation.classes[index]}</b>{row.map((value, column) => <span className={index === column ? "diagonal" : ""} key={`${index}-${column}`}>{value}</span>)}</div>)}</div>
      </Panel>
      <Panel title="Model comparison" subtitle="Held-out synthetic test set">
        <div className="comparison-list">{Object.entries(evaluation.comparison).map(([name, values]) => <div className="comparison-item" key={name}><b>{name}</b><span>Macro F1</span><strong>{(values.macro_f1 * 100).toFixed(1)}%</strong><span>FPR</span><strong>{(values.normal_false_positive_rate * 100).toFixed(1)}%</strong></div>)}</div>
      </Panel>
    </div>
    <Panel title="Feature importance" subtitle={`Global ${evaluation.selected_model} feature importance; not a causal or per-event explanation`}>
      <div className="importance-list">{evaluation.feature_importance.map((item) => <div className="importance-row" key={item.feature}><div><b>{item.feature.replace(/_/g, " ")}</b><small>{item.description}</small></div><div className="importance-track"><i style={{ width: `${Math.max(2, item.importance * 100)}%` }} /></div><strong>{(item.importance * 100).toFixed(1)}%</strong></div>)}</div>
    </Panel>
    <Panel title="Dataset & limitations" subtitle="Transparent synthetic evaluation details">
      <div className="dataset-facts">{Object.entries(evaluation.dataset).map(([key, value]) => <div key={key}><span>{key.replace(/_/g, " ")}</span><b>{value}</b></div>)}</div>
      <ul className="limitation-list">{evaluation.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
    </Panel>
  </div>;
}

function Investigation({ events, search, setSearch, filterRisk, setFilterRisk, onSelect }: { events: Event[]; search: string; setSearch: (value: string) => void; filterRisk: string; setFilterRisk: (value: string) => void; onSelect: (event: Event) => void }) {
  return <Panel title="Event investigation" subtitle="Search and filter observed telemetry records">
    <div className="table-tools"><label className="search-box"><span>⌕</span><input placeholder="Search process, activity, explanation…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select value={filterRisk} onChange={(event) => setFilterRisk(event.target.value)} aria-label="Filter by risk"><option value="all">All risk levels</option><option value="normal">Normal</option><option value="suspicious">Suspicious</option><option value="high_risk">High risk</option></select><span className="record-count">{events.length} records</span></div>
    {events.length === 0 ? <Empty text="No events match this search. Analyse telemetry or run the simulation to add events." /> : <div className="event-table-wrap"><table><thead><tr><th>Timestamp</th><th>Process label</th><th>Activity type</th><th>Risk level</th><th>Score</th><th>Explanation</th></tr></thead><tbody>{events.map((event) => <tr className="clickable-row" key={event.event_id} onClick={() => onSelect(event)}><td>{formatDateTime(event.timestamp)}</td><td className="mono">{event.process_label}</td><td>{event.activity_type}</td><td><RiskBadge risk={event.risk_level} /></td><td>{event.risk_score}</td><td className="explanation-cell">{event.explanation}</td></tr>)}</tbody></table></div>}
  </Panel>;
}

function EventDrawer({ event, onClose }: { event: Event; onClose: () => void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="event-drawer" onClick={(eventClick) => eventClick.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">EVENT DETAILS</span><h2>Telemetry record</h2></div><button className="close-button" onClick={onClose}>×</button></div><div className="drawer-score"><RiskBadge risk={event.risk_level} /><strong>{event.risk_score}<small> / 100</small></strong></div>
    <div className="detail-list"><div><span>Timestamp</span><b>{formatDateTime(event.timestamp)}</b></div><div><span>Process label</span><b className="mono">{event.process_label}</b></div><div><span>Activity</span><b>{event.activity_type}</b></div><div><span>Data source</span><b>{event.simulated ? "Synthetic simulation / submitted telemetry" : "Unknown"}</b></div></div>
    <h3>Explanation</h3><p className="drawer-text">{event.explanation}</p><h3>Telemetry features</h3><div className="feature-grid-detail">{fields.map((field) => <div key={field.key}><span>{field.label}</span><b>{event.telemetry[field.key]}</b></div>)}</div><div className="drawer-disclaimer">A model output is an indicator for review, not proof of compromise. MITRE mappings are shown only in the detection response when supported by heuristic indicators.</div>
  </aside></div>;
}

export default App;
