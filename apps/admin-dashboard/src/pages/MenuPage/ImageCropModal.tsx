import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
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
 * Fixed 4:3 crop so Image + Photos match the online menu card framing.
 * Portaled above the item editor modal.
 */
export function ImageCropModal({
  imageSrc,
  fileName = 'menu-image.jpg',
  title = 'Crop menu photo',
  onCancel,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    setError('');
    try {
      const file = await getCroppedMenuImage(imageSrc, croppedAreaPixels, fileName);
      await onConfirm(file);
    } catch (e) {
      setError((e as Error).message || 'Crop failed.');
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
          Drag to frame the dish. Everything outside the box is removed — the website and POS
          always show this 4:3 crop, so photos look consistent even if the originals differ.
        </p>

        <div style={{
          position: 'relative',
          width: '100%',
          height: 320,
          background: '#1C1408',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={MENU_IMAGE_ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
            showGrid
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, fontSize: 13, color: '#6B5D4F' }}>
          <span style={{ flexShrink: 0, fontWeight: 600, width: 48 }}>Zoom</span>
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

        {error && (
          <p style={{ margin: '10px 0 0', color: '#dc2626', fontSize: 13 }}>{error}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <Btn variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
          <Btn onClick={() => void handleConfirm()} disabled={busy || !croppedAreaPixels}>
            {busy ? 'Saving…' : 'Use cropped photo'}
          </Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}
