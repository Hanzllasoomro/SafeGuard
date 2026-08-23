import React, { useState, useEffect } from 'react';
import { getAlertSettings, updateAlertSettings, sendTestEmail, sendTestWhatsApp } from '../api/client';

const TABS = ['AI Thresholds', 'Alert Routing', 'User RBAC', 'System Logs'];

const REQUIRED_PPE = [
  { name: 'Safety Helmet',       icon: 'construction' },
  { name: 'High-Visibility Vest', icon: 'dry_cleaning' },
  { name: 'Face Mask',           icon: 'masks' },
];

/* ── Section heading ─────────────────────────────────────── */
const SectionHeading = ({ icon, title, accent = true }) => (
  <div className="flex items-center gap-2 mb-5 pb-3" style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
    <span className="material-symbols-outlined" style={{ color: accent ? '#FF6B00' : 'var(--color-on-surface-variant)', fontSize: '20px' }}>{icon}</span>
    <h3 className="font-headline-sm uppercase tracking-wider" style={{ color: accent ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)', fontSize: '14px' }}>{title}</h3>
  </div>
);

/* ── Toggle Switch ───────────────────────────────────────── */
const ToggleSwitch = ({ enabled, onChange, disabled = false }) => (
  <button
    onClick={() => !disabled && onChange(!enabled)}
    disabled={disabled}
    className="w-10 h-5 rounded-full relative transition-colors disabled:opacity-40"
    style={{ background: enabled ? '#FF6B00' : 'var(--color-surface-container-high)' }}
  >
    <div
      className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
      style={{ left: enabled ? '22px' : '2px' }}
    />
  </button>
);

/* ── Field helpers ───────────────────────────────────────── */
const FieldLabel = ({ children }) => (
  <label className="block font-data-label uppercase mb-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>{children}</label>
);

const TextInput = ({ value, onChange, type = 'text', placeholder = '', disabled = false }) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className="w-full rounded px-3 py-2 font-data-value outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    style={{ background: 'var(--color-surface-container-lowest)', border: '1px solid var(--color-outline)', color: disabled ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)', fontSize: '13px' }}
    onFocus={(e) => { if (!disabled) e.target.style.borderColor = '#FF6B00'; }}
    onBlur={(e) => { e.target.style.borderColor = 'var(--color-outline)'; }}
  />
);

/* ── Alert panel (email or whatsapp) ────────────────────── */
const AlertPanel = ({ title, icon, enabled, onToggle, fields, disabled = false }) => (
  <div
    className="glass-panel rounded overflow-hidden"
    style={{ opacity: disabled ? 0.75 : 1, transition: 'opacity 0.2s' }}
  >
    <div className="p-5" style={{ borderLeft: `2px solid ${enabled ? 'var(--color-slate-gray)' : 'var(--color-outline)'}`, background: 'var(--color-surface-container-low)' }}>
      <SectionHeading icon={icon} title={title} accent={false} />
      <div className="flex justify-between items-center mb-5">
        <span className="font-data-label uppercase" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}>Enable Notifications</span>
        <ToggleSwitch enabled={enabled} onChange={onToggle} disabled={disabled} />
      </div>
      <div className="flex flex-col gap-4">
        {fields.map(({ label, element }) => (
          <div key={label}>
            <FieldLabel>{label}</FieldLabel>
            {element}
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════ */
const SettingsPage = () => {
  const [activeTab, setActiveTab]     = useState('AI Thresholds');
  const [isSaving, setIsSaving]       = useState(false);
  const [saveStatus, setSaveStatus]   = useState(null); // 'success' | 'error'
  // Transient per-channel test status: { kind: 'success'|'error', text: string }
  // — the test buttons overwrite this after each press; cleared when the
  // user clicks again or navigates away.
  const [testStatus, setTestStatus]   = useState({ email: null, whatsapp: null });
  const [testInFlight, setTestInFlight] = useState({ email: false, whatsapp: false });
  const [settings, setSettings]       = useState({
    emailAlerts:          true,
    emailAddress:         'safety@company.com',
    emailCooldown:        '300',
    whatsappAlerts:       false,
    whatsappNumber:       '',
    whatsappCooldown:     '300',
    confidenceThreshold:  58,
  });

  /* ── fetch on mount ─────────────────────── */
  useEffect(() => {
    const load = async () => {
      try {
        const res  = await getAlertSettings();
        const data = res.data;
        setSettings((prev) => ({
          ...prev,
          emailAlerts:        data.email_enabled         ?? prev.emailAlerts,
          // `email_recipients` is a comma-separated STRING on the backend,
          // not an array — earlier code called `.join(', ')` on a string which
          // silently coerced and produced wrong values on round-trip.
          emailAddress:       data.email_recipients || prev.emailAddress,
          emailCooldown:      data.email_cooldown?.toString()   ?? prev.emailCooldown,
          whatsappAlerts:     data.whatsapp_enabled      ?? prev.whatsappAlerts,
          whatsappNumber:     data.whatsapp_recipient    ?? prev.whatsappNumber,
          whatsappCooldown:   data.whatsapp_cooldown?.toString() ?? prev.whatsappCooldown,
          confidenceThreshold: data.confidence_threshold != null
            ? Math.round(data.confidence_threshold * 100)
            : prev.confidenceThreshold,
        }));
      } catch { /* silent fail */ }
    };
    load();
  }, []);

  const set = (key, val) => setSettings((s) => ({ ...s, [key]: val }));

  /* ── save ───────────────────────────────── */
  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      await updateAlertSettings({
        email_enabled:       settings.emailAlerts,
        // Backend stores `email_recipients` as a comma-separated STRING.
        // Earlier code split on commas here and the backend then wrote a
        // Python-list repr back to the DB; sending the raw string the
        // user typed is correct.
        email_recipients:    settings.emailAddress.trim(),
        email_cooldown:      parseInt(settings.emailCooldown, 10),
        whatsapp_enabled:    settings.whatsappAlerts,
        whatsapp_recipient:  settings.whatsappNumber,
        whatsapp_cooldown:   parseInt(settings.whatsappCooldown, 10),
        confidence_threshold: settings.confidenceThreshold / 100.0,
      });
      setSaveStatus('success');
    } catch { setSaveStatus('error'); }
    finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  /* ── test buttons ────────────────────────── */
  // Both buttons issue a single test send through the same backend code
  // path as a real violation. The endpoint returns {ok, message, transport}
  // — we surface the message so the operator knows whether the send went
  // out via SMTP / Twilio / the local debug receiver.
  const handleSendTest = async (channel) => {
    setTestInFlight((p) => ({ ...p, [channel]: true }));
    setTestStatus((p) => ({ ...p, [channel]: null }));
    const send = channel === 'email' ? sendTestEmail : sendTestWhatsApp;
    try {
      const res = await send();
      const payload = res.data || {};
      setTestStatus((p) => ({
        ...p,
        [channel]: {
          kind: payload.ok ? 'success' : 'error',
          text: payload.message || (payload.ok ? 'Sent' : 'Failed'),
        },
      }));
    } catch (err) {
      const text = err?.response?.data?.message || err?.message || 'Network error';
      setTestStatus((p) => ({ ...p, [channel]: { kind: 'error', text } }));
    } finally {
      setTestInFlight((p) => ({ ...p, [channel]: false }));
      // Auto-clear after 6s so the message doesn't linger forever.
      setTimeout(() => setTestStatus((p) => ({ ...p, [channel]: null })), 6000);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Page Header */}
      <div
        className="px-6 py-5 flex justify-between items-end flex-shrink-0"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-outline-variant)', backdropFilter: 'blur(8px)' }}
      >
        <div>
          <h1 className="font-display-lg" style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, fontSize: '32px', color: 'var(--color-on-surface)', letterSpacing: '-0.02em' }}>
            System Configuration
          </h1>
          <p className="font-data-value mt-1" style={{ color: 'var(--color-on-surface-variant)', fontSize: '12px' }}>
            Manage global parameters for detection models, alert routing, and system access.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus && (
            <span
              className="font-data-label px-3 py-1.5 rounded animate-fade-in"
              style={{
                fontSize: '11px',
                background: saveStatus === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(255,45,85,0.15)',
                border: saveStatus === 'success' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,45,85,0.3)',
                color: saveStatus === 'success' ? '#10B981' : '#FF2D55',
              }}
            >
              {saveStatus === 'success' ? '✓ Saved successfully' : '✗ Save failed'}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2 rounded font-data-label uppercase tracking-wider transition-colors disabled:opacity-50"
            style={{ background: '#FF6B00', color: '#000', fontSize: '11px', fontWeight: 700 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-6 gap-1" style={{ borderBottom: '1px solid var(--color-outline-variant)', background: 'var(--color-surface-container)', flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-5 py-2.5 font-headline-sm transition-colors"
            style={{
              fontSize: '14px',
              color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'transparent',
              fontWeight: activeTab === tab ? 700 : 400,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">

          {activeTab === 'AI Thresholds' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Left: Detection Confidence */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                <div className="glass-panel rounded overflow-hidden" style={{ borderLeft: '2px solid #FF6B00' }}>
                  <div className="p-6" style={{ background: 'var(--color-surface-container-low)' }}>
                    <SectionHeading icon="tune" title="Detection Confidence" />
                    <div className="flex flex-col gap-8">

                      {/* Slider */}
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <label className="font-data-label uppercase" style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}>
                            Base Confidence Threshold
                          </label>
                          <span
                            className="font-data-value px-2 py-1 rounded"
                            style={{ color: '#FF6B00', background: 'var(--color-surface-container-high)', border: '1px solid var(--color-outline)', fontSize: '13px' }}
                          >
                            {settings.confidenceThreshold}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0} max={100}
                          value={settings.confidenceThreshold}
                          onChange={(e) => set('confidenceThreshold', Number(e.target.value))}
                          style={{ accentColor: '#FF6B00', width: '100%' }}
                        />
                        <p className="font-data-label mt-2" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.8, fontSize: '11px' }}>
                          Lower values detect more objects but may increase false positives.
                        </p>
                      </div>

                      <hr style={{ borderColor: 'var(--color-outline-variant)' }} />

                      {/* Always Required PPE */}
                      <div>
                        <h4 className="font-data-label uppercase tracking-wider mb-1" style={{ color: '#FF6B00', fontSize: '11px' }}>Always Required PPE</h4>
                        <p className="font-data-label mb-4" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.8, fontSize: '11px' }}>
                          These items are always required and cannot be disabled in standard operating modes.
                        </p>
                        <div className="flex flex-col gap-2">
                          {REQUIRED_PPE.map((ppe) => (
                            <div
                              key={ppe.name}
                              className="flex justify-between items-center p-3 rounded transition-colors"
                              style={{ background: 'var(--color-surface-container-lowest)', border: '1px solid var(--color-outline-variant)' }}
                            >
                              <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined" style={{ color: '#10B981', fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>{ppe.icon}</span>
                                <span className="font-body-sm font-bold" style={{ color: 'var(--color-on-surface)' }}>{ppe.name}</span>
                              </div>
                              <span
                                className="font-data-label px-2 py-1 rounded"
                                style={{ color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: '10px' }}
                              >
                                REQUIRED
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Alerts */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                <AlertPanel
                  title="Email Alerts"
                  icon="mail"
                  enabled={settings.emailAlerts}
                  onToggle={(v) => set('emailAlerts', v)}
                  fields={[
                    {
                      label: 'Recipient Email',
                      element: <TextInput value={settings.emailAddress} onChange={(e) => set('emailAddress', e.target.value)} type="email" />,
                    },
                    {
                      label: 'Cooldown Period (s)',
                      element: <TextInput value={settings.emailCooldown} onChange={(e) => set('emailCooldown', e.target.value)} type="number" />,
                    },
                    {
                      label: '',
                      element: (
                        <div className="flex flex-col gap-1 mt-1">
                          <button
                            onClick={() => handleSendTest('email')}
                            disabled={testInFlight.email}
                            className="w-full py-2 rounded font-data-label uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:text-on-surface"
                            style={{ border: '1px solid var(--color-outline)', color: 'var(--color-on-surface-variant)', fontSize: '11px', background: 'transparent' }}
                          >
                            {testInFlight.email ? 'Sending…' : 'Send Test Email'}
                          </button>
                          {testStatus.email && (
                            <p
                              className="font-data-label"
                              style={{
                                fontSize: '10px',
                                color: testStatus.email.kind === 'success' ? '#22c55e' : '#f87171',
                                textAlign: 'center',
                              }}
                            >
                              {testStatus.email.text}
                            </p>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />

                <AlertPanel
                  title="WhatsApp Alerts"
                  icon="chat"
                  enabled={settings.whatsappAlerts}
                  onToggle={(v) => set('whatsappAlerts', v)}
                  disabled={false}
                  fields={[
                    {
                      label: 'Phone Number',
                      element: (
                        <TextInput
                          value={settings.whatsappNumber}
                          onChange={(e) => set('whatsappNumber', e.target.value)}
                          placeholder="+1234567890"
                          disabled={!settings.whatsappAlerts}
                        />
                      ),
                    },
                    {
                      label: 'Cooldown Period (s)',
                      element: (
                        <TextInput
                          value={settings.whatsappCooldown}
                          onChange={(e) => set('whatsappCooldown', e.target.value)}
                          type="number"
                          disabled={!settings.whatsappAlerts}
                        />
                      ),
                    },
                    {
                      label: '',
                      element: (
                        <div className="flex flex-col gap-1 mt-1">
                          <button
                            onClick={() => handleSendTest('whatsapp')}
                            disabled={!settings.whatsappAlerts || testInFlight.whatsapp}
                            className="w-full py-2 rounded font-data-label uppercase tracking-wider mt-1 disabled:opacity-40 disabled:cursor-not-allowed hover:text-on-surface"
                            style={{ border: '1px solid var(--color-outline)', color: 'var(--color-on-surface-variant)', fontSize: '11px', background: 'transparent' }}
                          >
                            {testInFlight.whatsapp ? 'Sending…' : 'Send Test Message'}
                          </button>
                          {testStatus.whatsapp && (
                            <p
                              className="font-data-label"
                              style={{
                                fontSize: '10px',
                                color: testStatus.whatsapp.kind === 'success' ? '#22c55e' : '#f87171',
                                textAlign: 'center',
                              }}
                            >
                              {testStatus.whatsapp.text}
                            </p>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          )}

          {activeTab !== 'AI Thresholds' && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--color-surface-container-highest)' }}>construction</span>
              <p className="font-headline-sm" style={{ color: 'var(--color-on-surface-variant)' }}>{activeTab} — Coming Soon</p>
              <p className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.8, fontSize: '11px' }}>
                This section will be configured via backend API.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
