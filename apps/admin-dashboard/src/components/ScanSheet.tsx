/* eslint-disable local/no-hex-in-inline-style -- the camera viewport is black with white text in both themes, like a viewfinder; theme tokens would wash it out */
import { useEffect, useRef, useState } from 'react';

type Props = {
  title?: string;
  hint?: string;
  onScan: (code: string) => void;
  onClose: () => void;
};

/**
 * The camera as a scanner, for a phone or tablet at the stock shelf.
 *
 * Owner, 2026-09-02: scanning at stock receiving. Same decoder as the till,
 * loaded only when this opens, so the dashboard bundle does not carry it.
 */
export function ScanSheet({ title = 'Scan a barcode', hint = 'Point the camera at the barcode on the packet.', onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('This device has no camera the browser can use.');
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!result || doneRef.current) return;
          doneRef.current = true;
          controls.stop();
          onScan(result.getText());
        });
        stop = () => controls.stop();
        setReady(true);
      } catch (e) {
        const name = (e as { name?: string })?.name ?? '';
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was refused. Allow the camera for this site and try again.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device.'
              : 'The camera could not be started.',
        );
      }
    })();

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      stop?.();
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="scan-sheet"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ width: 'min(480px, 100%)', background: 'var(--color-surface)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(15,23,42,0.35)' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 16, color: 'var(--color-text)' }}>{title}</strong>
          <button type="button" onClick={onClose} aria-label="Close scanner" style={{ minWidth: 44, minHeight: 44, border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-muted)' }}>✕</button>
        </div>
        <div style={{ position: 'relative', background: '#000', aspectRatio: '4 / 3' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: error ? 'none' : 'block' }} />
          {!error && !ready && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>Starting camera…</div>
          )}
          {error && (
            <div role="alert" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#fff', fontSize: 14, textAlign: 'center', lineHeight: 1.5 }}>{error}</div>
          )}
        </div>
        <p style={{ margin: 0, padding: '12px 16px 16px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{hint}</p>
      </div>
    </div>
  );
}
