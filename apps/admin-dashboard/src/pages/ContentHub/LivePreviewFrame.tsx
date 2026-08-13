import { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

export type PreviewDevice = 'desktop' | 'mobile';

type Props = {
  url: string | null;
  loading?: boolean;
  /** Prefer mobile when opened from a phone preview sheet. */
  defaultDevice?: PreviewDevice;
  /**
   * Matrix row 13 / §7.2–§7.3: when set, preview device follows the editor's
   * selected Desktop/Mobile surface (canonical selector). Toggle is locked.
   */
  editorDevice?: PreviewDevice | null;
};

const WIDTHS: Record<PreviewDevice, number> = {
  desktop: 1280,
  mobile: 390,
};

const FRAME_HEIGHT = 560;

/**
 * Iframe of the real page with Desktop / Mobile width toggle.
 * Device widths are always the true CSS viewport (1280 / 390). When the
 * container is narrower, the frame is visually scaled down — never silently
 * constrained via max-width:100% (which made “Mobile 390” lie on phones).
 */
export function LivePreviewFrame({
  url,
  loading,
  defaultDevice = 'desktop',
  editorDevice = null,
}: Props) {
  const locked = editorDevice === 'desktop' || editorDevice === 'mobile';
  const [device, setDevice] = useState<PreviewDevice>(editorDevice ?? defaultDevice);
  const [tick, setTick] = useState(0);
  const [scale, setScale] = useState(1);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (locked) setDevice(editorDevice);
  }, [locked, editorDevice]);

  useEffect(() => {
    setTick((t) => t + 1);
  }, [url]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => {
      const available = host.clientWidth;
      const target = WIDTHS[device];
      setScale(available > 0 ? Math.min(1, available / target) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [device]);

  const logicalWidth = WIDTHS[device];

  return (
    <div
      data-testid="live-preview-frame"
      data-device={device}
      data-editor-device={locked ? editorDevice : undefined}
      data-device-locked={locked ? '1' : '0'}
      data-logical-width={logicalWidth}
      data-scale={scale.toFixed(3)}
      style={{
        background: 'var(--color-text)',
        borderRadius: 14,
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 420,
      }}
    >
      <div style={{
        display: 'flex', gap: 8, padding: 10, alignItems: 'center',
        borderBottom: '1px solid var(--color-signage-canvas-border)', flexWrap: 'wrap',
      }}
      >
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1, minWidth: 0,
        }}
        >
          Live preview
          <span style={{ marginLeft: 8, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
            {logicalWidth}px
            {scale < 0.999 ? ` · scaled ${Math.round(scale * 100)}%` : ''}
            {locked ? ' · follows editor surface' : ''}
          </span>
        </span>
        {(['desktop', 'mobile'] as const).map((d) => (
          <button
            key={d}
            type="button"
            data-testid={`preview-device-${d}`}
            onClick={() => { if (!locked) setDevice(d); }}
            disabled={locked}
            aria-pressed={device === d}
            style={{
              height: 32, padding: '0 10px', borderRadius: 8,
              background: device === d ? 'var(--color-primary)' : 'var(--color-signage-canvas-bg)',
              color: 'var(--color-bg)',
              cursor: locked ? 'default' : 'pointer',
              opacity: locked && device !== d ? 0.45 : 1,
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              border: 'none',
            }}
          >
            {d === 'desktop' ? <Monitor size={14} /> : <Smartphone size={14} />}
            {d === 'desktop' ? 'Desktop' : 'Mobile'}
          </button>
        ))}
      </div>
      <div
        ref={hostRef}
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: 12,
          background: 'var(--color-signage-canvas-bg)',
          overflow: 'auto',
          minWidth: 0,
        }}
      >
        {loading || !url ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, alignSelf: 'center' }}>
            {loading
              ? 'Refreshing preview…'
              : 'Preview updates as you edit. Publish to make live for customers.'}
          </p>
        ) : (
          <div
            data-testid="preview-scale-shell"
            style={{
              width: logicalWidth * scale,
              height: FRAME_HEIGHT * scale,
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <iframe
              key={`${url}-${tick}-${device}`}
              title="Content preview"
              src={url}
              data-testid="preview-iframe"
              style={{
                width: logicalWidth,
                height: FRAME_HEIGHT,
                border: 'none',
                borderRadius: 10,
                background: 'var(--color-surface)',
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                display: 'block',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
