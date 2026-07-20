import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { RotateCcw, RotateCw } from 'lucide-react';
import { Btn } from '../../components/Layout';
import { getCroppedMenuImage, MENU_IMAGE_ASPECT } from './cropImage';

type Props = {
  imageSrc: string;
  fileName?: string;
  title?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

/**
 * Fixed 4:3 crop + rotate so Image / Photos match menu & POS thumbnails.
 * Portaled above the item editor modal.
 */
export function ImageCropModal({
  imageSrc,
  fileName = 'menu-image.jpg',
  title = 'Edit menu photo',
  onCancel,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) {
      setError('Adjust the frame slightly, then try again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const file = await getCroppedMenuImage(imageSrc, croppedAreaPixels, fileName, rotation);
      await onConfirm(file);
    } catch (e) {
      setError((e as Error).message || 'Could not save the cropped photo.');
      setBusy(false);
    }
  };

  return createPortal(
    <div
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
        background: '#fff',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 560,
        boxShadow: '0 20px 60px rgba(28,20,8,0.22)',
        maxHeight: '92vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: '#1C1408' }}>{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            style={{
              background: '#F8F6F3', border: 'none', borderRadius: 8,
              width: 40, height: 40, cursor: busy ? 'not-allowed' : 'pointer', color: '#6B5D4F',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B5D4F', lineHeight: 1.45 }}>
          Drag, zoom, and rotate. Only the framed area is saved — this is what customers see on
          the menu and what cashiers see on POS.
        </p>

        <div style={{
          position: 'relative',
          width: '100%',
          height: 320,
          background: '#1C1408',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {!ready && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', fontSize: 13, zIndex: 1,
            }}>
              Loading image…
            </div>
          )}
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={MENU_IMAGE_ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            onMediaLoaded={() => setReady(true)}
            objectFit="contain"
            showGrid
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#6B5D4F', flex: 1, minWidth: 180 }}>
            <span style={{ flexShrink: 0, fontWeight: 600 }}>Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1 }}
              disabled={busy}
            />
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              title="Rotate left"
              disabled={busy}
              onClick={() => setRotation((r) => r - 90)}
              style={{
                minHeight: 40, minWidth: 40, borderRadius: 8, border: '1px solid #E8E0D8',
                background: '#F8F6F3', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <RotateCcw size={16} color="#6B5D4F" />
            </button>
            <button
              type="button"
              title="Rotate right"
              disabled={busy}
              onClick={() => setRotation((r) => r + 90)}
              style={{
                minHeight: 40, minWidth: 40, borderRadius: 8, border: '1px solid #E8E0D8',
                background: '#F8F6F3', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <RotateCw size={16} color="#6B5D4F" />
            </button>
          </div>
        </div>

        {error && (
          <p style={{ margin: '10px 0 0', color: '#dc2626', fontSize: 13 }}>{error}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <Btn variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
          <Btn onClick={() => void handleConfirm()} disabled={busy || !ready}>
            {busy ? 'Saving…' : 'Save cropped photo'}
          </Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}
