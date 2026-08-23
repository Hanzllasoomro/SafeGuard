import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const NAV_LINKS = [
  { name: 'Dashboard',     path: '/',          icon: 'dashboard',       end: true  },
  { name: 'Violations',    path: '/violations', icon: 'warning'                     },
  { name: 'Cameras',       path: '/cameras',    icon: 'videocam'                    },
  { name: 'Upload',        path: '/upload',     icon: 'upload'                      },
  { name: 'Settings',      path: '/settings',   icon: 'settings'                    },
];

const Sidebar = () => {
  return (
    <aside
      className="fixed left-0 top-0 h-screen w-64 flex flex-col z-40"
      style={{
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-outline-variant)',
      }}
    >
      {/* Brand / Avatar Header */}
      <div
        className="px-6 py-5 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,107,0,0.15)', border: '1px solid rgba(255,107,0,0.3)' }}
        >
          <span
            className="material-symbols-outlined"
            style={{ color: '#FF6B00', fontVariationSettings: "'FILL' 1", fontSize: '22px' }}
          >
            shield
          </span>
        </div>
        <div>
          <h2 style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, fontSize: '15px', color: '#FF6B00', lineHeight: '1.2', letterSpacing: '-0.01em' }}>
            SafeGuard AI
          </h2>
          <p className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>OPERATOR PANEL</p>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 py-4 flex flex-col gap-0.5 px-3 overflow-y-auto">
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            end={link.end}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-4 py-3 rounded font-body-sm transition-all duration-150 border-l-2'
                : 'flex items-center gap-3 px-4 py-3 rounded font-body-sm transition-all duration-150 border-l-2 border-transparent hover:scale-[0.98]'
            }
            style={({ isActive }) =>
              isActive
                ? { color: 'var(--color-primary)', borderLeftColor: 'var(--color-primary)', background: 'var(--color-primary-container)', borderRadius: '4px' }
                : { color: 'var(--color-on-surface-variant)', borderLeftColor: 'transparent' }
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '20px',
                    fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                    color: isActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                    transition: 'color 0.15s',
                  }}
                >
                  {link.icon}
                </span>
                <span style={{ fontSize: '14px', fontWeight: isActive ? 600 : 400 }}>{link.name}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer: Emergency Stop + Status */}
      <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--color-outline-variant)', paddingTop: '12px' }}>
        <button
          className="w-full py-2 rounded flex items-center justify-center gap-2 font-data-label transition-opacity hover:opacity-90 active:scale-95"
          style={{ background: '#FF2D55', color: '#fff', fontSize: '11px', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>power_settings_new</span>
          EMERGENCY STOP
        </button>
        <div
          className="mt-3 flex items-center gap-2 px-3 py-2 rounded"
          style={{ background: 'var(--color-surface-container)', border: '1px solid var(--color-outline-variant)' }}
        >
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#10B981' }} />
          <span className="font-data-label" style={{ color: 'var(--color-on-surface-variant)', fontSize: '10px' }}>SYSTEM ONLINE</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
