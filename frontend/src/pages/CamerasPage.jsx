import React, { useState, useEffect, useCallback } from 'react';
import {
  listCameras, createCamera, updateCamera, deleteCamera, testCamera, scanCameras,
  autoDetectCameras,
} from '../api/client';

/* ── helpers ─────────────────────────────────────────────── */
const emptyForm = () => ({
  name: '', source_type: 'webcam', url: '',
  username: '', password: '', location: '',
  resolution: '1920x1080', frame_rate: '30',
  ptz_enabled: false, enabled: true,
});

const StatusBadge = ({ online }) => (
  <span
    className="flex items-center gap-1 px-2 py-0.5 rounded font-data-label uppercase tracking-wider"
    style={{
      fontSize: '10px',
      background: online ? 'rgba(16,185,129,0.15)' : 'rgba(255,45,85,0.15)',
      border:     online ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,45,85,0.3)',
      color:      online ? '#10B981' : '#FF2D55',
    }}
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: online ? '#10B981' : '#FF2D55' }} />
    {online ? 'Online' : 'Offline'}
  </span>
);

const TypeBadge = ({ type }) => (
  <span
    className="px-2 py-0.5 rounded font-data-label uppercase tracking-wider"
    style={{ fontSize: '10px', background: 'var(--color-surface-container-high)', border: '1px solid var(--color-outline-variant)', color: 'var(--color-on-surface-variant)' }}
  >
    {type || 'webcam'}
  </span>
);

const Label = ({ children }) => (
  <label className="font-data-label uppercase" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>{children}</label>
);

const TextInput = ({ value, onChange, type = 'text', placeholder = '', disabled = false }) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className="w-full rounded px-3 py-2 font-body-sm transition-all outline-none disabled:opacity-50"
    style={{
      background: 'var(--color-surface-container-lowest)',
      border: '1px solid var(--color-outline)',
      color: 'var(--color-on-surface)',
      fontSize: '13px',
    }}
    onFocus={(e) => { e.target.style.borderColor = '#FF6B00'; }}
    onBlur={(e) => { e.target.style.borderColor = 'var(--color-outline)'; }}
  />
);

const SelectInput = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={onChange}
    className="w-full rounded px-2 py-2 font-data-value outline-none"
    style={{ background: 'var(--color-surface-container-lowest)', border: '1px solid var(--color-outline)', color: 'var(--color-on-surface)', fontSize: '12px' }}
  >
    {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
  </select>
);

/* ── Camera Card ─────────────────────────────────────────── */
const CameraCard = ({ camera, isSelected, onClick, onEdit, onDelete, testStatus, onTest }) => {
  const online = camera.enabled;
  const stripeColor = online ? (isSelected ? '#FF6B00' : 'var(--color-slate-gray)') : '#FF2D55';

  return (
    <div
      onClick={() => onClick(camera)}
      className={`glass-panel rounded-lg p-4 flex flex-col gap-3 cursor-pointer relative overflow-hidden group transition-all duration-150 ${isSelected ? 'active-glow' : 'hover:border-slate-gray'}`}
      style={{ borderLeft: `3px solid ${stripeColor}` }}
    >
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-headline-sm" style={{ color: online ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)', fontSize: '15px' }}>{camera.name}</h3>
          <p className="font-data-label flex items-center gap-1 mt-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>router</span>
            {camera.url || `192.168.1.${camera.id}`}
          </p>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <StatusBadge online={online} />
          {camera.source_type && <TypeBadge type={camera.source_type} />}
        </div>
      </div>

      {/* Thumbnail */}
      <div
        className="rounded aspect-video flex items-center justify-center relative overflow-hidden"
        style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid var(--color-outline-variant)' }}
      >
        {online ? (
          <>
            <span className="material-symbols-outlined z-10" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.4, fontSize: '36px' }}>videocam</span>
            <div className="absolute bottom-2 left-2 flex gap-1.5 z-10">
              <span className="font-data-label px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.8)', color: 'var(--color-on-surface)', fontSize: '10px', border: '1px solid var(--color-outline-variant)', backdropFilter: 'blur(4px)' }}>
                {camera.resolution || '1080p'}
              </span>
              <span className="font-data-label px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.8)', color: 'var(--color-on-surface)', fontSize: '10px', border: '1px solid var(--color-outline-variant)', backdropFilter: 'blur(4px)' }}>
                {camera.frame_rate || '30'}fps
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-center">
            <span className="material-symbols-outlined mb-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '28px' }}>videocam_off</span>
            <span className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>Signal Lost</span>
          </div>
        )}
      </div>

      {/* Actions row */}
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onTest(camera.id)}
          disabled={testStatus?.loading}
          className="flex-1 font-data-label uppercase tracking-wider px-2 py-1.5 rounded transition-colors hover:text-on-surface"
          style={{ fontSize: '10px', border: '1px solid var(--color-outline)', color: testStatus?.ok === true ? '#10B981' : testStatus?.ok === false ? '#FF2D55' : 'var(--color-on-surface-variant)', background: 'transparent' }}
        >
          {testStatus?.loading ? '...' : testStatus?.ok === true ? '✓ OK' : testStatus?.ok === false ? '✗ Fail' : 'Test'}
        </button>
        <button
          onClick={() => onEdit(camera)}
          className="flex-1 font-data-label uppercase tracking-wider px-2 py-1.5 rounded transition-colors hover:text-on-surface"
          style={{ fontSize: '10px', border: '1px solid var(--color-outline)', color: 'var(--color-on-surface-variant)', background: 'transparent' }}
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(camera.id)}
          className="flex-1 font-data-label uppercase tracking-wider px-2 py-1.5 rounded transition-colors"
          style={{ fontSize: '10px', border: '1px solid rgba(255,45,85,0.3)', color: '#FF2D55', background: 'transparent' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

/* ── Detail / Config Panel ───────────────────────────────── */
const ConfigPanel = ({ camera, form, onChange, onClose, onSave, isSubmitting, formError, editing }) => {
  const [ptzEnabled, setPtzEnabled] = useState(form.ptz_enabled ?? false);

  return (
    <div className="w-96 flex flex-col flex-shrink-0 overflow-hidden" style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-outline-variant)' }}>
      {/* Header */}
      <div className="px-4 py-3 flex justify-between items-center" style={{ background: 'var(--color-surface-container)', borderBottom: '1px solid var(--color-outline-variant)' }}>
        <h2 className="font-headline-sm" style={{ color: 'var(--color-on-surface)', fontSize: '16px' }}>
          {editing ? 'Edit Camera' : 'Add Camera'}
        </h2>
        <button onClick={onClose} style={{ color: 'var(--color-on-surface-variant)' }} className="hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {formError && (
          <p className="font-data-label px-3 py-2 rounded" style={{ background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.3)', color: '#FF2D55', fontSize: '11px' }}>{formError}</p>
        )}

        {/* Technical Specs */}
        <div>
          <h3 className="font-data-label uppercase tracking-wider pb-2 mb-3" style={{ color: '#FF6B00', borderBottom: '1px solid var(--color-outline-variant)', fontSize: '11px' }}>
            Technical Specs
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label>Camera Name</Label>
              <TextInput value={form.name} onChange={(e) => onChange('name', e.target.value)} placeholder="e.g. CAM-01: Main Entrance" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Source Type</Label>
              <SelectInput
                value={form.source_type}
                onChange={(e) => onChange('source_type', e.target.value)}
                options={[{ value: 'webcam', label: 'Webcam' }, { value: 'rtsp', label: 'RTSP Stream' }, { value: 'ip', label: 'IP Camera' }]}
              />
            </div>
            {form.source_type !== 'webcam' && (
              <div className="flex flex-col gap-1">
                <Label>Stream URL (RTSP)</Label>
                <TextInput value={form.url} onChange={(e) => onChange('url', e.target.value)} placeholder="rtsp://user:pass@192.168.1.x:554/stream1" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label>Location</Label>
              <TextInput value={form.location} onChange={(e) => onChange('location', e.target.value)} placeholder="e.g. Zone A / Loading Bay" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>Resolution</Label>
                <SelectInput
                  value={form.resolution || '1920x1080'}
                  onChange={(e) => onChange('resolution', e.target.value)}
                  options={['1920x1080', '1280x720', '640x480']}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Frame Rate</Label>
                <SelectInput
                  value={form.frame_rate || '30'}
                  onChange={(e) => onChange('frame_rate', e.target.value)}
                  options={[{ value: '30', label: '30 FPS' }, { value: '15', label: '15 FPS' }, { value: '5', label: '5 FPS' }]}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Enabled</Label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onChange('enabled', !form.enabled)}
                  className="w-10 h-5 rounded-full relative transition-colors"
                  style={{ background: form.enabled ? '#FF6B00' : 'var(--color-surface-container-high)' }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: form.enabled ? '22px' : '2px' }}
                  />
                </button>
                <span className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}>{form.enabled ? 'ENABLED' : 'DISABLED'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* PTZ Controls */}
        <div>
          <div className="flex justify-between items-center pb-2 mb-3" style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
            <h3 className="font-data-label uppercase tracking-wider" style={{ color: '#FF6B00', fontSize: '11px' }}>PTZ Control</h3>
            <div className="flex items-center gap-2">
              <span className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>{ptzEnabled ? 'ENABLED' : 'DISABLED'}</span>
              <button
                onClick={() => setPtzEnabled(!ptzEnabled)}
                className="w-8 h-4 rounded-full relative transition-colors"
                style={{ background: ptzEnabled ? '#FF6B00' : 'var(--color-surface-container-high)' }}
              >
                <div className="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: ptzEnabled ? '18px' : '2px' }} />
              </button>
            </div>
          </div>

          {ptzEnabled && (
            <>
              {/* D-Pad */}
              <div className="flex justify-center my-2">
                <div className="relative w-28 h-28 rounded-full flex items-center justify-center" style={{ background: 'var(--color-surface-container-lowest)', border: '1px solid var(--color-outline)' }}>
                  {[
                    { icon: 'keyboard_arrow_up',    style: { top: '6px', left: '50%', transform: 'translateX(-50%)' } },
                    { icon: 'keyboard_arrow_down',  style: { bottom: '6px', left: '50%', transform: 'translateX(-50%)' } },
                    { icon: 'keyboard_arrow_left',  style: { left: '6px', top: '50%', transform: 'translateY(-50%)' } },
                    { icon: 'keyboard_arrow_right', style: { right: '6px', top: '50%', transform: 'translateY(-50%)' } },
                  ].map(({ icon, style }) => (
                    <button key={icon} className="absolute p-0 transition-colors hover:text-orange-500" style={{ color: 'var(--color-on-surface-variant)', ...style }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '26px' }}>{icon}</span>
                    </button>
                  ))}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--color-surface-container-high)', border: '1px solid var(--color-outline-variant)' }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,107,0,0.5)' }} />
                  </div>
                </div>
              </div>
              {/* Zoom */}
              <div className="flex items-center gap-3 mt-3">
                <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', fontSize: '16px' }}>zoom_out</span>
                <input type="range" min="1" max="10" defaultValue="1" className="flex-1" style={{ accentColor: '#FF6B00' }} />
                <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', fontSize: '16px' }}>zoom_in</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer buttons */}
      <div className="p-4 flex gap-3" style={{ background: 'var(--color-surface-container)', borderTop: '1px solid var(--color-outline-variant)' }}>
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded font-data-label uppercase tracking-wider transition-colors hover:text-on-surface"
          style={{ border: '1px solid var(--color-outline)', color: 'var(--color-on-surface-variant)', fontSize: '11px', background: 'transparent' }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={isSubmitting}
          className="flex-1 py-2 rounded font-data-label uppercase tracking-wider transition-colors disabled:opacity-50"
          style={{ background: '#FF6B00', color: '#000', fontSize: '11px', fontWeight: 700 }}
        >
          {isSubmitting ? 'Saving...' : 'Apply Config'}
        </button>
      </div>
    </div>
  );
};

/* ── Auto-Detect Modal ──────────────────────────────────────
 * Shows the result of GET /api/cameras/auto-detect: local webcams + any
 * ONVIF cameras WS-Discovery found on the LAN. Operator picks which to add
 * via checkboxes; the modal POSTs each picked item through createCamera()
 * so existing validation + duplicate-name handling applies.
 */
const AutoDetectModal = ({ onClose, onAdded }) => {
  const [phase, setPhase]     = useState('scanning'); // 'scanning' | 'review' | 'adding' | 'error'
  const [results, setResults] = useState({ local: [], onvif: [], summary: { local_count: 0, onvif_count: 0 } });
  const [errorMsg, setErrorMsg] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [addErrors, setAddErrors] = useState([]);

  // Run the scan once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await autoDetectCameras();
        if (cancelled) return;
        setResults(res.data || { local: [], onvif: [], summary: { local_count: 0, onvif_count: 0 } });
        setPhase('review');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err?.response?.data?.detail || err?.message || 'Auto-detect failed.');
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const localKey  = (c) => `local:${c.index}`;
  const onvifKey  = (c) => `onvif:${c.ip}:${c.port}`;
  const isSelected = (k) => selected.has(k);

  const toggle = (k) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next;
  });

  // Pre-fill the new-camera payload the same way `emptyForm()` does so the
  // operator doesn't need to retype values. The real "save" still goes
  // through createCamera() so backend validation runs.
  const buildPayload = (k) => {
    if (k.startsWith('local:')) {
      const idx = Number(k.split(':')[1]);
      return {
        name: `Webcam ${idx}`,
        source_type: 'webcam',
        url: String(idx),
        enabled: true,
      };
    }
    if (k.startsWith('onvif:')) {
      const [, ip, port] = k.split(':');
      return {
        name: `ONVIF ${ip}`,
        source_type: 'rtsp',
        url: `rtsp://${ip}:${port}/onvif/streaming/channels/1`,
        enabled: true,
      };
    }
    return null;
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setPhase('adding');
    setAddErrors([]);
    let added = 0;
    const errors = [];
    for (const k of selected) {
      const payload = buildPayload(k);
      if (!payload) continue;
      try {
        await createCamera(payload);
        added++;
      } catch (err) {
        errors.push({
          key: k,
          detail: err?.response?.data?.detail || err?.message || 'Failed to add.',
        });
      }
    }
    if (errors.length) setAddErrors(errors);
    onAdded(added, errors);
    if (added > 0) onClose();
    else setPhase('review');
  };

  const totalFound = (results.local?.length || 0) + (results.onvif?.length || 0);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }}>
      <div className="flex flex-col rounded-lg overflow-hidden w-[640px] max-w-[92vw] max-h-[80vh] animate-slide-up" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        {/* Header */}
        <div className="px-5 py-3 flex justify-between items-center" style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
          <div>
            <h2 className="font-headline-sm" style={{ color: 'var(--color-on-surface)', fontSize: '16px' }}>Auto-Detect Cameras</h2>
            <p className="font-data-value mt-0.5" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}>
              Local webcams + ONVIF network scan
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--color-on-surface-variant)' }} className="hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {phase === 'scanning' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: '32px', color: '#FF6B00' }}>progress_activity</span>
              <p className="font-data-label uppercase tracking-wider" style={{ color: '#94A3B8', fontSize: '11px' }}>
                Scanning local webcams + ONVIF network...
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#FF2D55' }}>error</span>
              <p className="font-headline-sm" style={{ color: '#FF2D55', fontSize: '13px' }}>Auto-detect failed</p>
              <p className="font-data-value" style={{ color: '#94A3B8', fontSize: '11px' }}>{errorMsg}</p>
            </div>
          )}

          {phase !== 'scanning' && phase !== 'error' && (
            <>
              {totalFound === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#313540' }}>videocam_off</span>
                  <p className="font-headline-sm" style={{ color: '#94A3B8', fontSize: '13px' }}>No cameras detected</p>
                  <p className="font-data-value" style={{ color: '#94A3B8', fontSize: '11px' }}>
                    No local webcams found and no ONVIF devices responded on the LAN.
                  </p>
                </div>
              )}

              {results.local?.length > 0 && (
                <div>
                  <h3 className="font-data-label uppercase tracking-wider pb-2 mb-2" style={{ color: '#FF6B00', borderBottom: '1px solid var(--color-outline-variant)', fontSize: '11px' }}>
                    Local Webcams ({results.local.length})
                  </h3>
                  <div className="flex flex-col gap-2">
                    {results.local.map((c) => {
                      const k = localKey(c);
                      return (
                        <label key={k} className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors" style={{ background: 'var(--color-surface-container-lowest)', border: '1px solid var(--color-outline-variant)' }}>
                          <input type="checkbox" checked={isSelected(k)} onChange={() => toggle(k)} style={{ accentColor: '#FF6B00' }} />
                          <span className="material-symbols-outlined" style={{ color: '#FF6B00', fontSize: '18px' }}>videocam</span>
                          <div className="flex-1">
                            <p className="font-data-value" style={{ color: 'var(--color-on-surface)', fontSize: '12px' }}>Webcam {c.index}</p>
                            <p className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>{c.width}x{c.height} · {c.backend}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {results.onvif?.length > 0 && (
                <div>
                  <h3 className="font-data-label uppercase tracking-wider pb-2 mb-2" style={{ color: '#FF6B00', borderBottom: '1px solid var(--color-outline-variant)', fontSize: '11px' }}>
                    ONVIF Cameras ({results.onvif.length})
                  </h3>
                  <div className="flex flex-col gap-2">
                    {results.onvif.map((c) => {
                      const k = onvifKey(c);
                      return (
                        <label key={k} className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors" style={{ background: 'var(--color-surface-container-lowest)', border: '1px solid var(--color-outline-variant)' }}>
                          <input type="checkbox" checked={isSelected(k)} onChange={() => toggle(k)} style={{ accentColor: '#FF6B00' }} />
                          <span className="material-symbols-outlined" style={{ color: '#FF6B00', fontSize: '18px' }}>router</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-data-value truncate" style={{ color: 'var(--color-on-surface)', fontSize: '12px' }}>
                              {c.manufacturer || 'Unknown'} {c.model ? `· ${c.model}` : ''}
                            </p>
                            <p className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>
                              {c.ip}:{c.port}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {results.onvif?.length === 0 && results.local?.length === 0 && null}

              {addErrors.length > 0 && (
                <div className="flex flex-col gap-1 px-3 py-2 rounded" style={{ background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.3)' }}>
                  {addErrors.map((e, i) => (
                    <p key={i} className="font-data-label" style={{ color: '#FF2D55', fontSize: '11px' }}>
                      {e.key}: {e.detail}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex gap-3 justify-end" style={{ borderTop: '1px solid var(--color-outline-variant)', background: 'var(--color-surface-container)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded font-data-label uppercase tracking-wider hover:text-on-surface" style={{ border: '1px solid var(--color-outline)', color: 'var(--color-on-surface-variant)', fontSize: '11px', background: 'transparent' }}>
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={phase !== 'review' || selected.size === 0}
            className="px-4 py-2 rounded font-data-label uppercase tracking-wider disabled:opacity-40"
            style={{ background: '#FF6B00', color: '#000', fontSize: '11px', fontWeight: 700 }}
          >
            {phase === 'adding' ? 'Adding...' : `Add Selected (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
};


/* ══════════════════════════════════════════════════════════ */
const CamerasPage = () => {
  const [cameras, setCameras]         = useState([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [panelOpen, setPanelOpen]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const [form, setForm]               = useState(emptyForm());
  const [formError, setFormError]     = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testStatus, setTestStatus]   = useState({});
  const [autoDetectOpen, setAutoDetectOpen] = useState(false);
  const [toast, setToast]             = useState(null);

  const fetchCameras = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await listCameras();
      setCameras(Array.isArray(res.data) ? res.data : []);
    } catch { setCameras([]); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchCameras(); }, [fetchCameras]);

  // Toast auto-dismiss.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setPanelOpen(true);
  };

  const openEdit = (camera) => {
    setEditing(camera);
    setForm({
      name: camera.name || '',
      source_type: camera.source_type || 'webcam',
      url: camera.url || '',
      username: camera.username || '',
      password: '',
      location: camera.location || '',
      resolution: camera.resolution || '1920x1080',
      frame_rate: camera.frame_rate || '30',
      ptz_enabled: camera.ptz_enabled ?? false,
      enabled: camera.enabled ?? true,
    });
    setFormError('');
    setPanelOpen(true);
  };

  const closePanel = () => setPanelOpen(false);

  const handleFormChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Camera name is required.'); return; }
    setIsSubmitting(true);
    setFormError('');
    try {
      if (editing) await updateCamera(editing.id, form);
      else         await createCamera(form);
      await fetchCameras();
      closePanel();
    } catch (err) {
      setFormError(err?.response?.data?.detail || 'Failed to save camera.');
    } finally { setIsSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this camera?')) return;
    try { await deleteCamera(id); await fetchCameras(); } catch { /* ignore */ }
  };

  const handleTest = async (id) => {
    setTestStatus((s) => ({ ...s, [id]: { loading: true } }));
    try {
      const res = await testCamera(id);
      setTestStatus((s) => ({ ...s, [id]: { ok: true, message: res.data?.message } }));
    } catch (err) {
      setTestStatus((s) => ({ ...s, [id]: { ok: false, message: err?.response?.data?.detail } }));
    }
  };

  const handleAutoDetectAdded = (added, errors) => {
    if (added > 0) {
      setToast({ kind: 'ok', message: `Added ${added} camera${added === 1 ? '' : 's'}.` });
      fetchCameras();
    } else if (errors?.length) {
      setToast({ kind: 'err', message: `Could not add ${errors.length} camera${errors.length === 1 ? '' : 's'}.` });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page Header */}
      <div
        className="px-6 py-5 flex justify-between items-end flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-outline-variant)', background: 'var(--color-surface)', backdropFilter: 'blur(8px)' }}
      >
        <div>
          <h1 className="font-display-lg" style={{ color: 'var(--color-on-surface)', fontSize: '32px', letterSpacing: '-0.02em', fontFamily: 'Geist, sans-serif', fontWeight: 700 }}>
            Camera Management
          </h1>
          <p className="font-data-value mt-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '12px' }}>
            Manage IP, RTSP and webcam feeds across all sectors.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-panel flex items-center gap-2 px-3 py-1.5 rounded">
            <span className="w-2 h-2 rounded-full" style={{ background: '#10B981', boxShadow: '0 0 8px #10B981' }} />
            <span className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}>SYSTEM ONLINE</span>
          </div>
          <button
            onClick={() => setAutoDetectOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded font-data-label uppercase tracking-wider transition-colors"
            style={{ border: '1px solid rgba(255,107,0,0.5)', color: '#FF6B00', fontSize: '11px', background: 'transparent' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>radar</span>
            Auto-Detect
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded font-data-label uppercase tracking-wider transition-colors"
            style={{ background: '#FF6B00', color: '#000', fontSize: '11px', fontWeight: 700 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
            Add Camera
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Camera Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <span className="font-data-label" style={{ color: 'var(--color-on-surface-variant)' }}>Loading cameras…</span>
            </div>
          ) : cameras.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--color-surface-container-highest)' }}>videocam_off</span>
              <p className="font-headline-sm" style={{ color: 'var(--color-on-surface-variant)' }}>No cameras configured</p>
              <button onClick={openAdd} className="px-6 py-2 rounded font-data-label uppercase tracking-wider" style={{ background: '#FF6B00', color: '#000', fontSize: '11px', fontWeight: 700 }}>
                + Add First Camera
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {cameras.map((cam) => (
                <CameraCard
                  key={cam.id}
                  camera={cam}
                  isSelected={editing?.id === cam.id && panelOpen}
                  onClick={openEdit}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  testStatus={testStatus[cam.id]}
                  onTest={handleTest}
                />
              ))}
            </div>
          )}
        </div>

        {/* Config / PTZ Panel */}
        {panelOpen && (
          <ConfigPanel
            camera={editing}
            form={form}
            onChange={handleFormChange}
            onClose={closePanel}
            onSave={handleSave}
            isSubmitting={isSubmitting}
            formError={formError}
            editing={!!editing}
          />
        )}
      </div>

      {/* Auto-Detect Modal */}
      {autoDetectOpen && (
        <AutoDetectModal
          onClose={() => setAutoDetectOpen(false)}
          onAdded={handleAutoDetectAdded}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="absolute bottom-6 right-6 px-4 py-2 rounded font-data-label"
          style={{
            background: toast.kind === 'err' ? 'rgba(255,45,85,0.95)' : 'rgba(16,185,129,0.95)',
            color: '#fff',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 100,
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default CamerasPage;
