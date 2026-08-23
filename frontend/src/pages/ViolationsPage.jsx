import React, { useState, useEffect, useCallback } from 'react';
import { getViolations, clearViolations, shareViolationWhatsApp, getAlertSettings } from '../api/client';

const VIOLATION_TYPES = ['All Types', 'Missing Helmet', 'No High-Vis Vest', 'Unauthorized Zone', 'Missing PPE', 'Camera Obscured'];
const LOCATIONS       = ['Sector 7G', 'Loading Bay A', 'Loading Bay B', 'Main Gate', 'Forge Area'];

/* ── Severity badge ──────────────────────────────────────── */
const ViolationBadge = ({ type }) => {
  const lc = (type || '').toLowerCase();
  const isCamera = lc.includes('camera') || lc.includes('obscured');
  const style = isCamera
    ? { bg: 'var(--color-surface-container-high)', border: 'var(--color-outline-variant)', color: 'var(--color-on-surface-variant)', icon: 'visibility_off' }
    : { bg: 'var(--color-error-container)', border: 'var(--color-error)', color: 'var(--color-error)', icon: 'warning' };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-data-value"
      style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color, fontSize: '11px' }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{style.icon}</span>
      {type}
    </span>
  );
};

/* ── WhatsApp Share Panel (inside modal) ─────────────────── */
const WhatsAppSharePanel = ({ violation }) => {
  const [phoneNumber, setPhoneNumber]       = useState('');
  const [isSending, setIsSending]           = useState(false);
  const [sendStatus, setSendStatus]         = useState(null); // {ok, message}
  const [twilioExpanded, setTwilioExpanded] = useState(false);

  // Pre-load the globally configured WhatsApp number from settings.
  useEffect(() => {
    getAlertSettings()
      .then((res) => {
        const num = res.data?.whatsapp_recipient || '';
        if (num) setPhoneNumber(num);
      })
      .catch(() => {});
  }, []);

  // Build the WhatsApp Web quick-share URL with violation details pre-filled.
  const buildQuickShareUrl = () => {
    const id      = violation.id ? `EV-${violation.id}` : 'N/A';
    const missing = violation.missing_ppe || violation.violation_type || 'Unknown';
    const ts      = violation.timestamp ? new Date(violation.timestamp).toLocaleString() : 'N/A';
    const cam     = violation.camera_id || violation.camera_name || 'N/A';
    const conf    = violation.confidence != null ? `${Math.round(violation.confidence * 100)}%` : 'N/A';
    const text = [
      `🚨 *SafeGuard AI — PPE Violation Alert*`,
      ``,
      `*Violation ID:* ${id}`,
      `*Missing PPE:* ${missing}`,
      `*Timestamp:* ${ts}`,
      `*Camera:* ${cam}`,
      `*Confidence:* ${conf}`,
      ``,
      `Please take immediate corrective action.`,
    ].join('\n');
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  };

  const handleTwilioSend = async () => {
    setIsSending(true);
    setSendStatus(null);
    try {
      const payload = phoneNumber.trim() ? { phone_number: phoneNumber.trim() } : {};
      const res = await shareViolationWhatsApp(violation.id, payload);
      setSendStatus({ ok: res.data?.ok, message: res.data?.message || 'Done' });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Network error';
      setSendStatus({ ok: false, message: msg });
    } finally {
      setIsSending(false);
      setTimeout(() => setSendStatus(null), 6000);
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--color-outline-variant)', paddingTop: '16px' }}>
      {/* Section Header */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#25D366' }}>chat</span>
        <div className="font-data-label uppercase" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px', letterSpacing: '0.08em' }}>Share via WhatsApp</div>
      </div>

      {/* Quick Share button — opens WhatsApp Web with pre-filled message */}
      <a
        href={buildQuickShareUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded font-data-value font-bold transition-all hover:opacity-90 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
          color: '#fff',
          fontSize: '12px',
          textDecoration: 'none',
          boxShadow: '0 2px 8px rgba(37,211,102,0.35)',
        }}
      >
        {/* WhatsApp SVG icon */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Quick Share
      </a>

      {/* Twilio Dispatch collapsible */}
      <button
        onClick={() => setTwilioExpanded((v) => !v)}
        className="flex items-center justify-between w-full mt-3 py-1.5 transition-colors"
        style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px', background: 'transparent', border: 'none' }}
      >
        <span className="font-data-label uppercase" style={{ fontSize: '10px', letterSpacing: '0.06em' }}>Send via Twilio</span>
        <span className="material-symbols-outlined" style={{ fontSize: '14px', transition: 'transform 0.2s', transform: twilioExpanded ? 'rotate(180deg)' : 'none' }}>expand_more</span>
      </button>

      {twilioExpanded && (
        <div
          className="mt-2 p-3 rounded-lg flex flex-col gap-2"
          style={{ background: 'var(--color-surface-container)', border: '1px solid var(--color-outline-variant)' }}
        >
          {/* Phone number input */}
          <div>
            <label className="block font-data-label mb-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>
              RECIPIENT NUMBER
            </label>
            <div className="relative">
              <span
                className="absolute left-2 top-1/2 -translate-y-1/2 font-data-label"
                style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px', pointerEvents: 'none' }}
              >
                +
              </span>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="923001234567"
                className="w-full rounded pl-5 pr-2 py-1.5 font-data-value outline-none"
                style={{
                  background: 'var(--color-surface-container-lowest)',
                  border: '1px solid var(--color-outline)',
                  color: 'var(--color-on-surface)',
                  fontSize: '12px',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#25D366')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-outline)')}
              />
            </div>
            <p className="font-data-label mt-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px', opacity: 0.7 }}>
              Defaults to configured number if blank.
            </p>
          </div>

          {/* Send button */}
          <button
            onClick={handleTwilioSend}
            disabled={isSending}
            className="w-full py-2 rounded font-data-value font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
            style={{ background: '#128C7E', color: '#fff', fontSize: '12px' }}
          >
            {isSending ? (
              <>
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Sending…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>send</span>
                Send Violation Report
              </>
            )}
          </button>

          {/* Status feedback */}
          {sendStatus && (
            <div
              className="flex items-start gap-2 p-2 rounded text-left animate-fade-in"
              style={{
                background: sendStatus.ok ? 'rgba(37,211,102,0.1)' : 'rgba(255,45,85,0.1)',
                border: `1px solid ${sendStatus.ok ? 'rgba(37,211,102,0.35)' : 'rgba(255,45,85,0.35)'}`,
              }}
            >
              <span
                className="material-symbols-outlined flex-shrink-0 mt-0.5"
                style={{ fontSize: '14px', color: sendStatus.ok ? '#25D366' : '#FF2D55' }}
              >
                {sendStatus.ok ? 'check_circle' : 'error'}
              </span>
              <p className="font-data-label" style={{ fontSize: '10px', color: sendStatus.ok ? '#25D366' : '#FF2D55', lineHeight: 1.4 }}>
                {sendStatus.message}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Detail Modal ────────────────────────────────────────── */
const ViolationModal = ({ violation, onClose }) => {
  if (!violation) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-8 animate-fade-in"
      style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl max-w-4xl w-full flex flex-col overflow-hidden animate-slide-up"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)', boxShadow: '0 25px 50px rgba(0,0,0,0.15)', borderLeft: '2px solid #FF6B00', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3 flex justify-between items-center" style={{ background: 'var(--color-surface-container)', borderBottom: '1px solid var(--color-outline-variant)' }}>
          <h3 className="font-headline-md" style={{ color: 'var(--color-on-surface)', fontSize: '18px' }}>
            Violation Detail: EV-{violation.id || '---'}
          </h3>
          <button onClick={onClose} className="hover:text-on-surface transition-colors" style={{ color: 'var(--color-on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>close</span>
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* Image area */}
          <div className="flex-1 bg-black flex items-center justify-center relative p-4 min-h-48">
            {violation.screenshot_path ? (
              <img src={violation.screenshot_path} alt="Violation evidence" className="max-w-full max-h-full object-contain" style={{ border: '1px solid var(--color-outline-variant)' }} />
            ) : (
              <div className="flex flex-col items-center" style={{ color: 'var(--color-surface-container-highest)' }}>
                <span className="material-symbols-outlined mb-2" style={{ fontSize: '48px' }}>image_not_supported</span>
                <span className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}>No evidence image</span>
              </div>
            )}
            {/* Zoom controls overlay */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 glass-panel rounded-full px-4 py-2 flex gap-3 items-center">
              {['zoom_in', 'zoom_out', 'file_download'].map((icon) => (
                <button key={icon} className="hover:text-orange-400 transition-colors" style={{ color: '#fff' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Metadata panel */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-5 p-5 overflow-y-auto" style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-outline-variant)' }}>
            <div>
              <div className="font-data-label mb-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>VIOLATION TYPE</div>
              <ViolationBadge type={violation.violation_type || 'Unknown'} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'CONFIDENCE', value: violation.confidence != null ? `${Math.round(violation.confidence * 100)}%` : '—', color: '#FF6B00' },
                { label: 'CAMERA ID', value: violation.camera_id || violation.camera_name || '—', color: 'var(--color-on-surface)' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="font-data-label mb-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>{label}</div>
                  <div className="font-data-value" style={{ color, fontSize: '14px' }}>{value}</div>
                </div>
              ))}
              <div className="col-span-2">
                <div className="font-data-label mb-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>TIMESTAMP</div>
                <div className="font-data-value" style={{ color: 'var(--color-on-surface)', fontSize: '12px' }}>
                  {violation.timestamp ? new Date(violation.timestamp).toLocaleString() : '—'}
                </div>
              </div>
              {violation.location_name && (
                <div className="col-span-2">
                  <div className="font-data-label mb-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>LOCATION</div>
                  <div className="font-data-value" style={{ color: 'var(--color-on-surface)', fontSize: '12px' }}>{violation.location_name}</div>
                </div>
              )}
            </div>
            <div>
              <div className="font-data-label mb-2" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>ACTIONS</div>
              <div className="flex flex-col gap-2">
                <button
                  className="w-full py-2 rounded font-data-value transition-colors"
                  style={{ background: 'var(--color-surface-container)', border: '1px solid var(--color-outline-variant)', color: 'var(--color-on-surface)', fontSize: '12px' }}
                >
                  Mark False Positive
                </button>
                <button
                  className="w-full py-2 rounded font-data-value font-bold transition-opacity hover:opacity-90"
                  style={{ background: '#FF6B00', color: '#000', fontSize: '12px' }}
                >
                  Export to Incident Report
                </button>
              </div>
            </div>

            {/* ── WhatsApp Share Panel ── */}
            <WhatsAppSharePanel violation={violation} />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════ */
const ViolationsPage = () => {
  const [violations, setViolations]       = useState([]);
  const [total, setTotal]                 = useState(0);
  const [isLoading, setIsLoading]         = useState(true);
  const [selected, setSelected]           = useState(null);
  const [page, setPage]                   = useState(1);
  const PAGE_SIZE = 20;

  /* Filter state */
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [violationType, setViolationType] = useState('All Types');
  const [cameraId, setCameraId]           = useState('');
  const [locations, setLocations]         = useState({});

  const fetchViolations = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {
        page,
        per_page: PAGE_SIZE,
        ...(dateFrom           && { date_from: dateFrom }),
        ...(dateTo             && { date_to: dateTo }),
        ...(violationType !== 'All Types' && { violation_type: violationType }),
        ...(cameraId.trim()   && { camera_id: cameraId.trim() }),
      };
      const res = await getViolations(params);
      const data = res.data;
      if (Array.isArray(data)) {
        setViolations(data);
        setTotal(data.length);
      } else {
        setViolations(data.violations ?? data.items ?? []);
        setTotal(data.total ?? 0);
      }
    } catch { setViolations([]); }
    finally { setIsLoading(false); }
  }, [page, dateFrom, dateTo, violationType, cameraId]);

  useEffect(() => { fetchViolations(); }, [fetchViolations]);

  const applyFilters = () => { setPage(1); fetchViolations(); };
  const resetFilters = () => {
    setDateFrom(''); setDateTo(''); setViolationType('All Types'); setCameraId(''); setLocations({});
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="flex h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>

        {/* ── Filter Sidebar ─────────────────────────────────── */}
        <aside
          className="w-72 flex flex-col flex-shrink-0 overflow-y-auto"
          style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-outline-variant)' }}
        >
          <div className="px-4 py-3 flex justify-between items-center" style={{ background: 'var(--color-surface-container)', borderBottom: '1px solid var(--color-outline-variant)' }}>
            <h3 className="font-headline-sm" style={{ color: 'var(--color-on-surface)', fontSize: '16px' }}>Filters</h3>
            <button onClick={resetFilters} className="font-data-label hover:text-on-surface transition-colors" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}>RESET</button>
          </div>

          <div className="p-4 flex flex-col gap-5">

            {/* Time Range */}
            <div>
              <label className="block font-data-label mb-2" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>TIME RANGE</label>
              <div className="flex flex-col gap-2">
                {[
                  { val: dateFrom, set: setDateFrom, placeholder: 'From: YYYY-MM-DD' },
                  { val: dateTo,   set: setDateTo,   placeholder: 'To: YYYY-MM-DD'   },
                ].map(({ val, set, placeholder }, i) => (
                  <div key={i} className="relative">
                    <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-on-surface-variant)', fontSize: '14px' }}>calendar_month</span>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      placeholder={placeholder}
                      className="w-full rounded pl-8 pr-2 py-1.5 font-data-value outline-none"
                      style={{ background: 'var(--color-surface-container-lowest)', border: '1px solid var(--color-outline)', color: 'var(--color-on-surface)', fontSize: '11px' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Violation Type */}
            <div>
              <label className="block font-data-label mb-2" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>VIOLATION TYPE</label>
              <select
                value={violationType}
                onChange={(e) => setViolationType(e.target.value)}
                className="w-full rounded px-2 py-1.5 font-data-value outline-none"
                style={{ background: 'var(--color-surface-container-lowest)', border: '1px solid var(--color-outline)', color: 'var(--color-on-surface)', fontSize: '12px' }}
              >
                {VIOLATION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>

            {/* Camera ID */}
            <div>
              <label className="block font-data-label mb-2" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>CAMERA ID</label>
              <input
                type="text"
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                placeholder="e.g. CAM-01"
                className="w-full rounded px-2 py-1.5 font-data-value outline-none"
                style={{ background: 'var(--color-surface-container-lowest)', border: '1px solid var(--color-outline)', color: 'var(--color-on-surface)', fontSize: '12px' }}
              />
            </div>

            {/* Site Location */}
            <div>
              <label className="block font-data-label mb-2" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>SITE LOCATION</label>
              <div className="flex flex-col gap-2">
                {LOCATIONS.map((loc) => (
                  <label key={loc} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!locations[loc]}
                      onChange={() => setLocations((l) => ({ ...l, [loc]: !l[loc] }))}
                      style={{ accentColor: '#FF6B00' }}
                    />
                    <span className="font-data-label" style={{ color: 'var(--color-on-surface)', fontSize: '12px' }}>{loc}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 mt-auto" style={{ borderTop: '1px solid var(--color-outline-variant)' }}>
            <button
              onClick={applyFilters}
              className="w-full py-2 rounded font-data-value uppercase tracking-wider transition-colors"
              style={{ background: 'var(--color-surface-container-highest)', color: 'var(--color-on-surface)', fontSize: '12px', fontWeight: 700 }}
            >
              APPLY FILTERS
            </button>
          </div>
        </aside>

        {/* ── Main Data Area ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Header bar */}
          <div
            className="p-4 flex justify-between items-center flex-shrink-0 status-bar-alert"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)', margin: '8px', borderRadius: '8px' }}
          >
            <div>
              <div className="font-headline-md font-bold" style={{ color: 'var(--color-on-surface)', fontSize: '20px' }}>
                {isLoading ? '…' : total} Violations Found
              </div>
              <div className="font-data-label mt-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}>
                {violationType !== 'All Types' ? `Filtered by: ${violationType}` : 'Showing all violations'}
              </div>
            </div>
            <div className="flex gap-2">
              {[
                { icon: 'delete',       label: 'Archive Evidence' },
                { icon: 'download',     label: 'Export CSV' },
              ].map(({ icon, label }) => (
                <button key={label} className="flex items-center gap-2 px-4 py-2 rounded font-body-sm transition-colors hover:text-on-surface" style={{ border: '1px solid var(--color-outline)', color: 'var(--color-on-surface-variant)', background: 'transparent', fontSize: '13px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{icon}</span>
                  {label}
                </button>
              ))}
              <button
                onClick={() => { if (window.confirm('Clear all violations?')) clearViolations().then(fetchViolations); }}
                className="flex items-center gap-2 px-4 py-2 rounded font-body-sm font-bold transition-opacity hover:opacity-90"
                style={{ background: '#FF6B00', color: '#000', fontSize: '13px' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>picture_as_pdf</span>
                Export PDF Report
              </button>
            </div>
          </div>

          {/* Table */}
          <div
            className="flex-1 flex flex-col overflow-hidden mx-2 mb-2 rounded-lg"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}
          >
            <div className="overflow-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead style={{ background: 'var(--color-surface-container)', position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid var(--color-outline-variant)' }}>
                  <tr>
                    {['EVIDENCE', 'TIMESTAMP (UTC)', 'VIOLATION TYPE', 'CAMERA / LOC', 'CONFIDENCE', 'ACTION'].map((h, i) => (
                      <th key={h} className="p-3 font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px', textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-data-value" style={{ color: 'var(--color-on-surface)' }}>
                  {isLoading ? (
                    <tr><td colSpan={6} className="p-8 text-center font-data-label" style={{ color: 'var(--color-on-surface-variant)' }}>Loading…</td></tr>
                  ) : violations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <span className="material-symbols-outlined mb-3 block" style={{ fontSize: '40px', color: 'var(--color-surface-container-highest)' }}>inventory_2</span>
                        <p className="font-data-label" style={{ color: 'var(--color-on-surface-variant)' }}>No violations found</p>
                      </td>
                    </tr>
                  ) : (
                    violations.map((v, i) => (
                      <tr
                        key={v.id ?? i}
                        onClick={() => setSelected(v)}
                        className="zebra-row cursor-pointer transition-colors hover:bg-surface-container"
                        style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
                      >
                        <td className="p-3">
                          {v.screenshot_path ? (
                            <img src={v.screenshot_path} alt="evidence" className="w-16 h-12 object-cover rounded-sm" style={{ border: '1px solid var(--color-outline-variant)' }} />
                          ) : (
                            <div className="w-16 h-12 rounded-sm flex items-center justify-center" style={{ background: 'var(--color-surface-container)', border: '1px solid var(--color-outline-variant)' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-on-surface-variant)' }}>broken_image</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3" style={{ fontSize: '12px' }}>{v.timestamp ? new Date(v.timestamp).toLocaleString() : '—'}</td>
                        <td className="p-3"><ViolationBadge type={v.violation_type || 'Unknown'} /></td>
                        <td className="p-3" style={{ color: 'var(--color-on-surface-variant)', fontSize: '12px' }}>
                          {v.camera_id || v.camera_name || '—'}
                          {v.location_name && <><br /><span style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', opacity: 0.8 }}>{v.location_name}</span></>}
                        </td>
                        <td className="p-3">
                          <span style={{ color: v.confidence != null ? '#FF6B00' : 'var(--color-on-surface-variant)', fontSize: '13px' }}>
                            {v.confidence != null ? `${Math.round(v.confidence * 100)}%` : 'N/A'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button className="p-1 transition-colors hover:text-primary" style={{ color: 'var(--color-on-surface-variant)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>open_in_new</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-3 flex justify-between items-center flex-shrink-0" style={{ background: 'var(--color-surface-container)', borderTop: '1px solid var(--color-outline-variant)' }}>
              <span className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}>
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 rounded font-data-label disabled:opacity-40"
                  style={{ border: '1px solid var(--color-outline)', color: 'var(--color-on-surface-variant)', fontSize: '11px', background: 'transparent' }}
                >
                  PREV
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className="px-2 py-1 rounded font-data-label"
                    style={{
                      border: page === p ? '1px solid #FF6B00' : '1px solid var(--color-outline)',
                      background: page === p ? 'var(--color-primary-container)' : 'transparent',
                      color: page === p ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                      fontSize: '11px',
                    }}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2 py-1 rounded font-data-label disabled:opacity-40"
                  style={{ border: '1px solid var(--color-outline)', color: 'var(--color-on-surface-variant)', fontSize: '11px', background: 'transparent' }}
                >
                  NEXT
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selected && <ViolationModal violation={selected} onClose={() => setSelected(null)} />}
    </>
  );
};

export default ViolationsPage;
