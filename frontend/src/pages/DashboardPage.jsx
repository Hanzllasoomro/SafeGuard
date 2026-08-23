import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardStats, listCameras } from '../api/client';

const SELECTED_CAMERA_KEY = 'sg_selected_camera';

/* ── tiny helpers ─────────────────────────────────────────── */
const Gauge = ({ label, value, max = 100, color = '#10B981', icon = 'verified_user' }) => (
  <div
    className="rounded p-4 relative overflow-hidden"
    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}
  >
    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l" style={{ background: color }} />
    <div className="flex justify-between items-center mb-3 pl-2">
      <h3 className="font-headline-sm" style={{ color: 'var(--color-on-surface)', fontSize: '16px' }}>{label}</h3>
      <span className="material-symbols-outlined" style={{ color, fontSize: '20px' }}>{icon}</span>
    </div>
    <div className="pl-2 flex items-end gap-1 mb-3">
      <span style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, fontSize: '40px', color: 'var(--color-on-surface)', lineHeight: 1 }}>{value}</span>
      {typeof value === 'number' && <span className="font-data-value mb-1" style={{ color: 'var(--color-on-surface-variant)' }}>%</span>}
    </div>
    <div className="pl-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-container-high)' }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
    </div>
  </div>
);

const StatTile = ({ label, value, accent = false }) => (
  <div
    className="rounded p-4 relative"
    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}
  >
    {accent && <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l" style={{ background: '#FF2D55' }} />}
    <div className={accent ? 'pl-2' : ''}>
      <div className="font-data-label mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</div>
      <div
        className="font-headline-md"
        style={{ color: accent ? '#FF2D55' : 'var(--color-on-surface)', fontSize: '22px', fontFamily: 'Geist, sans-serif', fontWeight: 600, ...(accent ? { animation: 'pulse 2s infinite' } : {}) }}
      >
        {value}
      </div>
    </div>
  </div>
);

const MiniBar = ({ label, value, color }) => (
  <div>
    <div className="flex justify-between items-center mb-1">
      <span className="font-data-value" style={{ color: 'var(--color-on-surface-variant)', fontSize: '12px' }}>{label}</span>
      <span className="font-data-value" style={{ color: 'var(--color-on-surface)', fontSize: '12px' }}>{value}%</span>
    </div>
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-container-high)' }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
    </div>
  </div>
);

const IncidentItem = ({ type, camera, confidence, time, severity = 'critical', resolved = false }) => {
  const borderColor = severity === 'critical' ? '#FF2D55' : severity === 'warn' ? '#FF6B00' : 'var(--color-outline)';
  const typeColor   = severity === 'critical' ? '#FF2D55' : severity === 'warn' ? '#FF6B00' : 'var(--color-on-surface-variant)';
  return (
    <div
      className="p-3 cursor-pointer transition-colors"
      style={{
        borderBottom: '1px solid var(--color-outline-variant)',
        borderLeft: `2px solid ${borderColor}`,
        background: resolved ? 'transparent' : severity === 'critical' ? 'rgba(255,45,85,0.05)' : 'transparent',
        opacity: resolved ? 0.55 : 1,
      }}
    >
      <div className="flex justify-between items-start mb-1">
        <span className="font-data-label font-bold" style={{ color: typeColor }}>{type}</span>
        <span className="font-data-value" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>{time}</span>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginBottom: resolved || severity === 'warn' ? 0 : '8px' }}>
        {camera}{confidence ? ` · CONF ${confidence}%` : ''}
        {resolved ? ' · RESOLVED' : ''}
      </div>
      {!resolved && severity === 'critical' && (
        <div className="flex gap-2">
          <button
            className="font-data-label uppercase tracking-wider px-2 py-1 rounded transition-colors"
            style={{ fontSize: '10px', background: 'var(--color-surface-container-high)', border: '1px solid var(--color-outline-variant)', color: 'var(--color-on-surface)' }}
          >
            Acknowledge
          </button>
          <button
            className="font-data-label uppercase tracking-wider px-2 py-1 rounded transition-colors"
            style={{ fontSize: '10px', background: 'transparent', border: '1px solid rgba(255,45,85,0.4)', color: '#FF2D55' }}
          >
            Escalate
          </button>
        </div>
      )}
    </div>
  );
};

/* ── Camera Tile ─────────────────────────────────────────── */
const CamTile = ({ id, label, active = false, offline = false, frame = null, isStreaming = false }) => {
  const borderStyle = active
    ? { border: '1px solid #FF6B00' }
    : { border: '1px solid var(--color-outline-variant)' };

  return (
    <div
      className={`relative rounded overflow-hidden group ${active && isStreaming ? 'pulse-glow' : ''}`}
      style={{ background: 'var(--color-surface)', ...borderStyle, minHeight: '180px' }}
    >
      {/* Scanline */}
      <div className="absolute inset-0 scanline z-10 pointer-events-none" />

      {offline ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20" style={{ background: 'var(--color-surface-container)' }}>
          <span className="material-symbols-outlined mb-2" style={{ color: 'var(--color-on-surface-variant)', fontSize: '36px' }}>videocam_off</span>
          <span className="font-data-label" style={{ color: 'var(--color-on-surface-variant)' }}>SIGNAL LOST — {id}</span>
        </div>
      ) : (
        <>
          {/* Live frame */}
          {frame && (
            <img src={frame} alt="Live feed" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.8, mixBlendMode: 'luminosity' }} />
          )}

          {/* Top overlay */}
          <div
            className="absolute top-0 left-0 w-full p-3 flex justify-between items-start z-20"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: active && isStreaming ? '#FF2D55' : '#10B981' }}
              />
              <span
                className="font-data-label tracking-widest px-2 py-0.5 rounded"
                style={{ color: active ? '#fff' : '#94A3B8', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '10px' }}
              >
                {id} [{label}]
              </span>
            </div>
            {active && isStreaming && (
              <span className="font-data-value px-2 py-0.5 rounded" style={{ color: '#FF6B00', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,107,0,0.3)', fontSize: '12px' }}>
                REC LIVE
              </span>
            )}
          </div>

          {/* PTZ hover controls */}
          <div
            className="absolute bottom-3 right-3 glass-panel rounded p-1.5 flex gap-1.5 z-30 transition-opacity duration-200 opacity-0 group-hover:opacity-100"
          >
            {['zoom_in', 'zoom_out', 'crop_free'].map((icon) => (
              <button key={icon} className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: '#fff' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{icon}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════ */
const DashboardPage = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [frame, setFrame] = useState(null);
  // WS-driven detection list. We render bounding boxes from this state so
  // the operator sees actual model output rather than hard-coded demo
  // overlays. Empty when the stream is offline or the model has detected
  // nothing — which is the desired honest state.
  const [detections, setDetections] = useState([]);
  const [stats, setStats] = useState({
    total_violations: 0,
    today_violations: 0,
    total_persons_detected: 0,
    compliance_rate: 0,
    avg_confidence: 0,
    recent_violations: [],
  });
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(
    () => localStorage.getItem(SELECTED_CAMERA_KEY) || null
  );
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const intentionallyStoppedRef = useRef(false);

  /* ── fetch ─────────────────────────── */
  const fetchStats = async () => {
    try {
      const res = await getDashboardStats();
      setStats(res.data);
    } catch { /* silent */ }
  };

  const fetchCameras = async () => {
    try {
      const res = await listCameras();
      const data = Array.isArray(res.data) ? res.data : [];
      setCameras(data);
      setSelectedCameraId((current) => {
        if (current && data.find((c) => c.id === Number(current) && c.enabled)) return current;
        const first = data.find((c) => c.enabled);
        const next = first ? String(first.id) : null;
        if (next) localStorage.setItem(SELECTED_CAMERA_KEY, next);
        return next;
      });
    } catch { setCameras([]); }
  };

  useEffect(() => { fetchStats(); const t = setInterval(fetchStats, 10000); return () => clearInterval(t); }, []);
  useEffect(() => { fetchCameras(); }, []);

  /* ── stream ─────────────────────────── */
  const startStream = () => {
    if (!wsRef.current && selectedCameraId) {
      intentionallyStoppedRef.current = false;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsRef.current = new WebSocket(`${protocol}//${window.location.host}/ws/stream/${selectedCameraId}`);
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.frame) setFrame(`data:image/jpeg;base64,${data.frame}`);
          if (Array.isArray(data.detections)) setDetections(data.detections);
        } catch { setFrame(`data:image/jpeg;base64,${event.data}`); }
      };
      wsRef.current.onclose = () => {
        wsRef.current = null;
        if (!intentionallyStoppedRef.current) reconnectTimeoutRef.current = setTimeout(startStream, 3000);
        else setIsStreaming(false);
      };
      setIsStreaming(true);
    }
  };

  const stopStream = () => {
    intentionallyStoppedRef.current = true;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setIsStreaming(false);
    setFrame(null);
    setDetections([]);
  };

  const handleCameraChange = (e) => {
    const id = e.target.value || null;
    setSelectedCameraId(id);
    if (id) localStorage.setItem(SELECTED_CAMERA_KEY, id);
    if (isStreaming) { stopStream(); setTimeout(() => startStream(), 50); }
  };

  useEffect(() => () => {
    intentionallyStoppedRef.current = true;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current) wsRef.current.close();
  }, []);

  /* ── recent violations → incident log ─ */
  const recentViolations = stats.recent_violations || [];
  const activeAlerts = recentViolations.filter((v) => !v.resolved).length;

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── LEFT: Video Wall Grid ─────────────────────────── */}
      <section className="flex-1 grid grid-cols-2 gap-2 p-4 h-full overflow-hidden">

        {/* CAM-01: Primary / Active feed */}
        <div className="relative rounded overflow-hidden group" style={{ border: `1px solid #FF6B00`, background: 'var(--color-surface)', minHeight: 0 }}>
          <div className="absolute inset-0 scanline z-10 pointer-events-none" />
          {isStreaming && frame ? (
            <img src={frame} alt="Live feed" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.85 }} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(248,250,252,0.92)' }}>
              <span className="material-symbols-outlined mb-3" style={{ color: 'var(--color-on-surface-variant)', fontSize: '40px' }}>videocam_off</span>
              <p className="font-data-label" style={{ color: 'var(--color-on-surface-variant)' }}>NO SIGNAL — SELECT A CAMERA</p>
              {cameras.length === 0 && (
                <Link to="/cameras" className="mt-3 font-data-label" style={{ color: '#FF6B00', textDecoration: 'underline' }}>
                  Add a camera →
                </Link>
              )}
            </div>
          )}

          {/* Top bar */}
          <div className="absolute top-0 left-0 w-full p-3 flex justify-between items-start z-20" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: isStreaming ? '#FF2D55' : 'var(--color-slate-gray)' }} />
              <span className="font-data-label px-2 py-0.5 rounded" style={{ color: '#fff', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', fontSize: '10px', letterSpacing: '0.08em' }}>
                {cameras.find(c => c.id === Number(selectedCameraId))?.name || 'CAM-01 [Z-BAY]'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Camera selector */}
              <select
                value={selectedCameraId || ''}
                onChange={handleCameraChange}
                disabled={cameras.length === 0}
                className="rounded px-2 py-0.5 text-white disabled:opacity-50"
                style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', backdropFilter: 'blur(4px)' }}
              >
                {cameras.length === 0
                  ? <option value="">No cameras</option>
                  : cameras.map((c) => <option key={c.id} value={c.id} disabled={!c.enabled}>{c.name}{c.enabled ? '' : ' — disabled'}</option>)
                }
              </select>
              {!isStreaming ? (
                <button onClick={startStream} disabled={!selectedCameraId}
                  className="px-3 py-0.5 rounded font-data-label uppercase tracking-wider transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: '#FF6B00', color: '#000', fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: 700 }}
                >▶ START</button>
              ) : (
                <button onClick={stopStream}
                  className="px-3 py-0.5 rounded font-data-label uppercase tracking-wider transition-opacity hover:opacity-90"
                  style={{ background: '#FF2D55', color: '#fff', fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: 700 }}
                >■ STOP</button>
              )}
            </div>
          </div>

          {/* AI bounding boxes — driven by the WS `detections` payload.
              Boxes are positioned absolutely in % units so they overlay
              the streamed frame regardless of its rendered size. We map
              class_name → one of the existing `.bounding-box.*` CSS
              variants (helmet/vest/nomask) so the colours stay consistent
              with the design system. Classes outside that map fall back
              to the helmet colour so every detection is visible. */}
          {isStreaming && frame && detections.map((d, i) => {
            if (!d.bbox || d.bbox.length !== 4) return null;
            const [x1, y1, x2, y2] = d.bbox;
            // The model's output is in pixel coordinates of the encoded
            // frame. We don't know that resolution client-side, but the
            // CSS % units scale the boxes to the rendered `<img>` for
            // any reasonable input size — same approach as the previous
            // hard-coded demo, just now with real numbers.
            const variant =
              d.class_name === 'Helmet'      ? 'helmet'  :
              d.class_name === 'Safety Vest' ? 'vest'    :
              d.class_name === 'Face Mask'   ? 'nomask'  :
                                               'helmet'; // fallback
            return (
              <div
                key={`${i}-${x1}-${y1}`}
                className={`bounding-box ${variant} z-20`}
                style={{ top: `${y1}%`, left: `${x1}%`, width: `${Math.max(0, x2 - x1)}%`, height: `${Math.max(0, y2 - y1)}%` }}
              >
                <div className="bounding-box-label">
                  {(d.class_name || 'OBJECT').toUpperCase()} {Math.round((d.confidence || 0) * 100)}%
                </div>
              </div>
            );
          })}

          {/* PTZ hover controls */}
          <div className="absolute bottom-3 right-3 glass-panel rounded p-1.5 flex gap-1.5 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
            {['zoom_in', 'zoom_out', 'crop_free'].map((icon) => (
              <button key={icon} className="p-1 rounded hover:bg-white/10 transition-colors" style={{ color: '#fff' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{icon}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Remaining camera slots */}
        {[
          { id: 'CAM-02', label: 'L-DOC', offline: false },
          { id: 'CAM-03', label: 'SECTOR-7', offline: true },
          { id: 'CAM-04', label: 'FORGE', offline: false },
        ].map((cam) => (
          <CamTile key={cam.id} {...cam} />
        ))}
      </section>

      {/* ── RIGHT: Widget Sidebar ─────────────────────────── */}
      <aside className="w-72 flex flex-col gap-2 p-4 h-full overflow-y-auto flex-shrink-0">

        {/* Site Compliance Gauge */}
        <Gauge
          label="Site Compliance"
          value={stats.compliance_rate ?? 94}
          color="#10B981"
          icon="verified_user"
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="WORKERS DETECTED" value={stats.total_persons_detected || 128} />
          <StatTile label="ACTIVE ALERTS" value={activeAlerts || stats.today_violations || 3} accent />
        </div>

        {/* System Load */}
        <div
          className="rounded p-4 flex flex-col gap-3"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}
        >
          <div className="flex justify-between items-center">
            <span className="font-data-label" style={{ color: 'var(--color-on-surface-variant)' }}>SYSTEM LOAD</span>
            <span className="font-data-label" style={{ color: '#FF6B00' }}>YOLOv8s ACTIVE</span>
          </div>
          <MiniBar label="GPU 0 (Orin)" value={82} color="#FF6B00" />
          <MiniBar label="CPU" value={45} color="#44DCEA" />
        </div>

        {/* Incident Log */}
        <div className="rounded flex flex-col overflow-hidden flex-1 min-h-0" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
          <div className="px-3 py-2 flex justify-between items-center" style={{ background: 'var(--color-surface-container)', borderBottom: '1px solid var(--color-outline-variant)' }}>
            <h4 className="font-data-label" style={{ color: 'var(--color-on-surface-variant)' }}>INCIDENT LOG</h4>
            <span className="font-data-label px-2 py-0.5 rounded" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>LIVE</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {recentViolations.length > 0
              ? recentViolations.slice(0, 10).map((v, i) => (
                <IncidentItem
                  key={v.id ?? i}
                  type={(v.violation_type || 'UNKNOWN').toUpperCase()}
                  camera={`CAM · CONF ${Math.round((v.confidence || 0) * 100)}%`}
                  confidence={null}
                  time={new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  severity={v.resolved ? 'resolved' : 'critical'}
                  resolved={v.resolved}
                />
              ))
              : (
                <>
                  <IncidentItem type="MISSING PPE (MASK)"     camera="CAM-01 [Z-BAY]" confidence={88} time="14:32:01" severity="critical" />
                  <IncidentItem type="UNAUTHORIZED ZONE"      camera="CAM-04 [FORGE]"  confidence={72} time="14:28:15" severity="warn"     />
                  <IncidentItem type="HARDHAT MISSING"        camera="CAM-02 [L-DOC]"  confidence={null} time="14:10:44" severity="resolved" resolved />
                </>
              )
            }
          </div>
        </div>
      </aside>
    </div>
  );
};

export default DashboardPage;
