import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { RotateCcw, RotateCw, X } from 'lucide-react';
import { Btn } from '../../components/SharedUI';
import { useDialogChrome } from '../../components/SharedUI';
import { getCroppedMenuImage, MENU_IMAGE_ASPECT, MENU_IMAGE_HEIGHT, MENU_IMAGE_WIDTH } from './cropImage';

type Props = {
  imageSrc: string;
  fileName?: string;
  title?: string;
  hint?: string;
  /** Crop frame aspect ratio (width / height). Default 4:3 menu tiles. */
  aspect?: number;
  outputWidth?: number;
  outputHeight?: number;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

/**
 * Fixed-aspect crop + rotate. Portaled above the item/category editor modal.
 *
 * key={imageSrc} remounts fresh state when the photo changes. Do not reset
 * ready/crop pixels in a useEffect — React Strict Mode re-runs effects and
 * would clear them after onCropComplete already fired, leaving "Loading…" stuck.
 */
export function ImageCropModal(props: Props) {
  return createPortal(
    <ImageCropModalBody key={props.imageSrc} {...props} />,
    document.body,
  );
}

function ImageCropModalBody({
  imageSrc,
  fileName = 'menu-image.jpg',
  title = 'Edit menu photo',
  hint = 'Drag, zoom, and rotate. Only the framed area is saved — this is what customers see on the menu and what cashiers see on POS.',
  aspect = MENU_IMAGE_ASPECT,
  outputWidth = MENU_IMAGE_WIDTH,
  outputHeight = MENU_IMAGE_HEIGHT,
  onCancel,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mediaReady, setMediaReady] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
    if (pixels.width > 0 && pixels.height > 0) {
      setMediaReady(true);
    }
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) {
      setError('Adjust the frame slightly, then try again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const file = await getCroppedMenuImage(
        imageSrc,
        croppedAreaPixels,
        fileName,
        rotation,
        { width: outputWidth, height: outputHeight },
      );
      await onConfirm(file);
    } catch (e) {
      setError((e as Error).message || 'Could not save the cropped photo.');
      setBusy(false);
    }
  };

  const canSave = mediaReady && !!croppedAreaPixels && !busy;
  // Escape, focus trap, focus restore and a scroll lock — the crop dialog had
  // the portal and the aria but none of the behaviour (audit A3).
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogChrome(onCancel, panelRef);

  const cropperHeight = aspect >= 2 ? 240 : 320;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(28,20,8,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
    >
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: aspect >= 2 ? 720 : 560,
        boxShadow: '0 20px 60px rgba(28,20,8,0.22)',
        maxHeight: '92vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: 'var(--color-text)' }}>{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            style={{
              background: 'var(--color-bg)', border: 'none', borderRadius: 8,
              width: 36, height: 36, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--color-text-secondary)',
            }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
          {hint}
        </p>

        <div style={{
          position: 'relative',
          width: '100%',
          height: cropperHeight,
          // A checked grey, the usual sign for "no picture here", rather than
          // near-black, which read as black bars in the photo (owner,
          // 2026-09-30). Nothing outside the frame is saved.
          backgroundColor: 'var(--color-border-light)',
          backgroundImage: 'linear-gradient(45deg, var(--color-border) 25%, transparent 25%), linear-gradient(-45deg, var(--color-border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-border) 75%), linear-gradient(-45deg, transparent 75%, var(--color-border) 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {!mediaReady && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', fontSize: 13, zIndex: 2,
              pointerEvents: 'none',
              background: 'rgba(28,20,8,0.35)',
            }}>
              Loading image…
            </div>
          )}
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            onMediaLoaded={() => setMediaReady(true)}
            objectFit="contain"
            showGrid
            style={{
              containerStyle: { width: '100%', height: '100%' },
            }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--color-text-secondary)', flex: 1, minWidth: 180 }}>
            <span style={{ flexShrink: 0, fontWeight: 600 }}>Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1 }}
              disabled={busy || !mediaReady}
            />
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              title="Rotate left"
              disabled={busy || !mediaReady}
              onClick={() => setRotation((r) => r - 90)}
              style={{
                minHeight: 32, minWidth: 40, borderRadius: 8, border: '1px solid var(--color-border)',
                background: 'var(--color-bg)', cursor: mediaReady && !busy ? 'pointer' : 'not-allowed', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <RotateCcw size={16} color="var(--color-text-secondary)" />
            </button>
            <button
              type="button"
              title="Rotate right"
              disabled={busy || !mediaReady}
              onClick={() => setRotation((r) => r + 90)}
              style={{
                minHeight: 32, minWidth: 40, borderRadius: 8, border: '1px solid var(--color-border)',
                background: 'var(--color-bg)', cursor: mediaReady && !busy ? 'pointer' : 'not-allowed', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <RotateCw size={16} color="var(--color-text-secondary)" />
            </button>
          </div>
        </div>

        {error && (
          <p style={{ margin: '10px 0 0', color: 'var(--color-danger-strong)', fontSize: 13 }}>{error}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <Btn variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
          <Btn onClick={() => void handleConfirm()} disabled={!canSave}>
            {busy ? 'Saving…' : 'Save cropped photo'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
