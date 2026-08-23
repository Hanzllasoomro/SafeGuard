import React from 'react';
import { NavLink } from 'react-router-dom';

const Navbar = () => {
  return (
    <header
      className="fixed top-0 left-64 right-0 h-16 z-50 flex items-center justify-between px-6"
      style={{
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-outline-variant)',
      }}
    >
      {/* Left: Brand + Top Nav */}
      <div className="flex items-center gap-6">
        <span style={{ fontFamily: 'Geist, sans-serif', fontWeight: 900, fontSize: '18px', color: '#FF6B00', letterSpacing: '-0.01em' }}>
          SafeGuard AI
        </span>
        <div className="w-px h-5" style={{ background: 'var(--color-outline-variant)' }} />
        <nav className="hidden md:flex items-center gap-6">
          {['Live View', 'Analysis', 'Archives'].map((label) => (
            <a
              key={label}
              href="#"
              className="font-body-sm transition-colors duration-150 hover:text-on-surface"
              style={{ color: 'var(--color-on-surface-variant)', fontSize: '14px', fontWeight: 500 }}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        <button
          className="flex items-center gap-2 px-4 py-1.5 rounded font-data-label uppercase tracking-wider hover:opacity-90 active:opacity-80 transition-opacity"
          style={{ background: '#FF2D55', color: '#fff', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>emergency</span>
          Emergency Stop
        </button>
        <button
          className="px-4 py-1.5 rounded font-data-label uppercase tracking-wider transition-colors hover:text-on-surface"
          style={{ border: '1px solid var(--color-outline)', color: 'var(--color-on-surface-variant)', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', background: 'transparent' }}
        >
          Export
        </button>
        <div className="w-px h-5" style={{ background: 'var(--color-outline-variant)', marginLeft: '4px' }} />
        <button
          className="p-2 rounded-full transition-colors hover:text-on-surface"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>notifications</span>
        </button>
        <button
          className="p-2 rounded-full transition-colors hover:text-on-surface"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>account_circle</span>
        </button>
      </div>
    </header>
  );
};

export default Navbar;
