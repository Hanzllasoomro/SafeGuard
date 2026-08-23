import React from 'react';

const Footer = () => (
  <footer
    className="fixed bottom-0 left-64 right-0 h-8 z-40 flex items-center justify-between px-6"
    style={{
      background: 'var(--color-surface)',
      borderTop: '1px solid var(--color-outline-variant)',
    }}
  >
    <div className="font-data-value flex items-center gap-4" style={{ color: 'var(--color-on-surface)', fontSize: '11px' }}>
      System Status: <span style={{ color: '#10B981' }}>Online</span>
      &nbsp;|&nbsp;Model: YOLOv8s&nbsp;|&nbsp;Jetson Orin Core
    </div>
    <div className="flex items-center gap-4">
      {['System Logs', 'Safety Protocols', 'Help Desk'].map((label) => (
        <a
          key={label}
          href="#"
          className="font-data-label transition-colors hover:text-on-surface"
          style={{ color: 'var(--color-on-surface-variant)', fontSize: '11px' }}
        >
          {label}
        </a>
      ))}
    </div>
  </footer>
);

export default Footer;
