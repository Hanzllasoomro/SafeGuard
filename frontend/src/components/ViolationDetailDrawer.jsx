import React, { useEffect, useState } from 'react';
import Drawer from './ui/Drawer';
import { getViolationById } from '../api/client';

const SOURCE_STYLES = {
  image_upload: 'bg-sg-tertiary-container/20 text-sg-tertiary border-sg-tertiary/30',
  video_upload: 'bg-sg-primary-container/20 text-sg-primary border-sg-primary/30',
  live_stream:  'bg-sg-error-container/20 text-sg-error border-sg-error/30',
};

const SOURCE_LABELS = {
  image_upload: 'IMAGE UPLOAD',
  video_upload: 'VIDEO UPLOAD',
  live_stream:  'LIVE STREAM',
};

const safeJson = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

/**
 * Right-side drawer that shows the full details of a single violation.
 * Fetches via `getViolationById(id)` when `violationId` becomes non-null.
 *
 * Props:
 *   - violationId: number | null
 *   - onClose: () => void
 */
const ViolationDetailDrawer = ({ violationId, onClose }) => {
  const [violation, setViolation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (violationId === null || violationId === undefined) {
      setViolation(null);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getViolationById(violationId)
      .then((res) => {
        if (!cancelled) setViolation(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load violation', err);
          setError('Could not load violation details.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [violationId]);

  const detections = violation ? safeJson(violation.detections, []) : [];
  const bbox = violation ? safeJson(violation.bbox, null) : null;
  const missingPpe = violation?.missing_ppe
    ? violation.missing_ppe.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <Drawer
      open={violationId !== null && violationId !== undefined}
      onClose={onClose}
      title={violation ? `Violation #${violation.id}` : 'Violation Details'}
      width="520px"
    >
      {isLoading && (
        <div className="flex items-center justify-center gap-3 py-16">
          <div className="w-5 h-5 border-2 border-sg-primary/30 border-t-sg-primary rounded-full animate-spin" />
          <span className="font-body-md text-sg-on-surface-variant">Loading details...</span>
        </div>
      )}

      {!isLoading && error && (
        <div className="p-6 text-center">
          <span className="material-symbols-outlined text-4xl text-sg-error mb-3 block">error</span>
          <p className="font-body-md text-sg-error">{error}</p>
        </div>
      )}

      {!isLoading && !error && violation && (
        <div className="p-6 space-y-6">
          {/* Screenshot */}
          <div className="bg-[#05080f] border border-sg-outline-variant rounded-lg overflow-hidden flex items-center justify-center">
            {violation.screenshot_path ? (
              <img
                src={violation.screenshot_path}
                alt="Violation"
                className="max-h-[60vh] w-full object-contain"
              />
            ) : (
              <div className="h-48 flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-sg-surface-bright text-3xl">image</span>
                <p className="font-body-sm text-sg-on-surface-variant text-center px-4">
                  No screenshot — live-stream violations don't persist a frame.
                </p>
              </div>
            )}
          </div>

          {/* Pills row: source + type + timestamp */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                SOURCE_STYLES[violation.source] ||
                'bg-sg-surface-container-high text-sg-on-surface-variant border-sg-outline-variant'
              }`}
            >
              {SOURCE_LABELS[violation.source] || (violation.source || 'UNKNOWN').toUpperCase()}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sg-error-container/20 text-sg-error border border-sg-error/30">
              {violation.violation_type || 'Violation'}
            </span>
            <span className="font-data-mono text-sg-on-surface-variant text-xs ml-auto">
              {violation.timestamp ? new Date(violation.timestamp).toLocaleString() : ''}
            </span>
          </div>

          {/* KPI strip: persons + confidence */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-sg-surface-container-low border border-sg-outline-variant rounded-lg p-4">
              <div className="font-label-caps text-sg-on-surface-variant">Persons in Frame</div>
              <div className="font-data-mono text-3xl font-bold text-sg-on-surface mt-1">
                {violation.person_count ?? 0}
              </div>
            </div>
            <div className="bg-sg-surface-container-low border border-sg-outline-variant rounded-lg p-4">
              <div className="font-label-caps text-sg-on-surface-variant">Person Confidence</div>
              <div className="font-data-mono text-3xl font-bold text-sg-primary mt-1">
                {violation.confidence ? (violation.confidence * 100).toFixed(1) : '0.0'}
                <span className="text-base text-sg-on-surface-variant ml-1">%</span>
              </div>
            </div>
          </div>

          {/* Missing PPE */}
          {missingPpe.length > 0 && (
            <section>
              <h3 className="font-label-caps text-sg-on-surface-variant mb-2">Missing PPE</h3>
              <div className="flex flex-wrap gap-2">
                {missingPpe.map((ppe) => (
                  <span
                    key={ppe}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-sg-error-container/20 text-sg-error border border-sg-error/30"
                  >
                    <span className="material-symbols-outlined text-sm">block</span>
                    {ppe}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Primary person bbox */}
          {bbox && (
            <section>
              <h3 className="font-label-caps text-sg-on-surface-variant mb-2">Primary Person Bounding Box</h3>
              <code className="block bg-sg-surface-container-low border border-sg-outline-variant rounded-lg px-4 py-3 font-data-mono text-sm text-sg-on-surface">
                [{bbox.join(', ')}]
              </code>
            </section>
          )}

          {/* Detected objects table */}
          <section>
            <h3 className="font-label-caps text-sg-on-surface-variant mb-2">
              Detected Objects ({detections.length})
            </h3>
            {detections.length === 0 ? (
              <p className="font-body-md text-sg-on-surface-variant">
                No detection payload was saved for this violation (likely from an older record).
              </p>
            ) : (
              <div className="bg-sg-surface-container-low border border-sg-outline-variant rounded-lg overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-sg-outline-variant bg-sg-surface-container/50">
                  <div className="col-span-4 font-label-caps text-sg-on-surface-variant">Class</div>
                  <div className="col-span-3 font-label-caps text-sg-on-surface-variant text-right">Conf.</div>
                  <div className="col-span-5 font-label-caps text-sg-on-surface-variant">Bounding Box</div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {detections.map((d, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-sg-outline-variant/50 last:border-b-0 items-center"
                    >
                      <div className="col-span-4">
                        <span className="font-body-md text-sg-on-surface">{d.class_name}</span>
                      </div>
                      <div className="col-span-3 font-data-mono text-sg-on-surface text-right">
                        {d.confidence ? (d.confidence * 100).toFixed(1) + '%' : '-'}
                      </div>
                      <div className="col-span-5 font-data-mono text-sg-on-surface-variant text-xs">
                        {d.bbox ? `[${d.bbox.join(', ')}]` : '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Source metadata */}
          <section>
            <h3 className="font-label-caps text-sg-on-surface-variant mb-2">Source</h3>
            <div className="bg-sg-surface-container-low border border-sg-outline-variant rounded-lg p-4 space-y-1">
              <div className="flex justify-between">
                <span className="font-body-md text-sg-on-surface-variant">Channel</span>
                <span className="font-data-mono text-sg-on-surface">
                  {SOURCE_LABELS[violation.source] || violation.source || 'unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-body-md text-sg-on-surface-variant">Details</span>
                <span className="font-body-md text-sg-on-surface text-right max-w-[60%] truncate">
                  {violation.details || '-'}
                </span>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Footer actions */}
      {!isLoading && !error && violation && (
        <footer className="border-t border-sg-outline-variant bg-sg-surface-container-low px-6 py-4 flex items-center gap-3">
          {violation.screenshot_path && (
            <a
              href={violation.screenshot_path}
              download={`violation_${violation.id}.jpg`}
              className="flex items-center gap-2 px-4 py-2 bg-sg-primary text-sg-on-primary rounded font-body-md font-bold hover:bg-sg-primary-fixed-dim transition-colors"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              Download
            </a>
          )}
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 border border-sg-outline-variant text-sg-on-surface rounded font-body-md hover:bg-sg-surface-container-high transition-colors ml-auto"
          >
            Close
          </button>
        </footer>
      )}
    </Drawer>
  );
};

export default ViolationDetailDrawer;
