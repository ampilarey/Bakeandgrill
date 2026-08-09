import { useEffect, useRef, useState } from 'react';
import {
  CURRENCY_FACES,
  getCurrencyImages,
  uploadCurrencyImage,
  resetCurrencyImage,
} from '../../api';

/** Bundled POS thumbnail for a face — shown until the owner uploads a custom one. */
function bundledUrl(face: number): string {
  const file =
    face === 100_000 ? 'note-1000.webp'
    : face === 50_000 ? 'note-500.webp'
    : face === 10_000 ? 'note-100.webp'
    : face === 5_000 ? 'note-50.webp'
    : face === 2_000 ? 'note-20.webp'
    : face === 1_000 ? 'note-10.webp'
    : face === 500 ? 'note-5.webp'
    : face === 200 ? 'coin-2.webp'
    : face === 100 ? 'coin-1.webp'
    : face === 50 ? 'coin-0.50.webp'
    : face === 25 ? 'coin-0.25.webp'
    : face === 20 ? 'coin-0.20.webp'
    : face === 10 ? 'coin-0.10.webp'
    : face === 5 ? 'coin-0.05.webp'
    : face === 2 ? 'coin-0.02.webp'
    : 'coin-0.01.webp';
  return `/pos/currency/${file}`;
}

export function CurrencyPhotosSettings() {
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyFace, setBusyFace] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFaceRef = useRef<number | null>(null);

  useEffect(() => {
    void getCurrencyImages()
      .then((r) => setCustom(r.images ?? {}))
      .catch(() => setError('Could not load current photos.'))
      .finally(() => setLoading(false));
  }, []);

  const pickFile = (face: number) => {
    pendingFaceRef.current = face;
    fileInputRef.current?.click();
  };

  const onFile = async (file: File | null) => {
    const face = pendingFaceRef.current;
    pendingFaceRef.current = null;
    if (!file || face == null) return;
    setBusyFace(face);
    setError('');
    setOkMsg('');
    try {
      const { url } = await uploadCurrencyImage(face, file);
      setCustom((prev) => ({ ...prev, [String(face)]: url }));
      setOkMsg('Photo updated — the POS picks it up on next open.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusyFace(null);
    }
  };

  const onReset = async (face: number) => {
    setBusyFace(face);
    setError('');
    setOkMsg('');
    try {
      await resetCurrencyImage(face);
      setCustom((prev) => {
        const next = { ...prev };
        delete next[String(face)];
        return next;
      });
      setOkMsg('Reverted to the default photo.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed.');
    } finally {
      setBusyFace(null);
    }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          void onFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
        These photos appear on the POS <strong>Close shift</strong> cash count. Upload a clear,
        straight-on photo of each note or coin (PNG/JPG/WebP). Landscape works best for notes,
        square for coins. Reset removes your photo and restores the built-in one.
      </p>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 10 }}>{error}</p>}
      {okMsg && <p style={{ color: 'var(--color-success)', fontSize: 13, marginBottom: 10 }}>{okMsg}</p>}
      {loading && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</p>}

      <div
        data-responsive-grid
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}
      >
        {CURRENCY_FACES.map(({ face, label, kind }) => {
          const customUrl = custom[String(face)];
          const src = customUrl ?? bundledUrl(face);
          const busy = busyFace === face;
          return (
            <div
              key={face}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                background: 'var(--color-surface)',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{label}</span>
                {customUrl ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)' }}>Custom</span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>Default</span>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 84,
                  background: 'var(--color-bg)',
                  borderRadius: 10,
                  padding: 8,
                }}
              >
                <img
                  src={src}
                  alt={label}
                  style={
                    kind === 'note'
                      ? { width: 150, height: 70, objectFit: 'cover', borderRadius: 6 }
                      : { width: 64, height: 64, objectFit: 'cover', borderRadius: '50%' }
                  }
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => pickFile(face)}
                  style={{
                    flex: 1,
                    minHeight: 40,
                    borderRadius: 10,
                    border: 'none',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  {busy ? 'Working…' : customUrl ? 'Replace photo' : 'Upload photo'}
                </button>
                {customUrl && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onReset(face)}
                    style={{
                      minHeight: 40,
                      padding: '0 12px',
                      borderRadius: 10,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-secondary)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: busy ? 'wait' : 'pointer',
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
