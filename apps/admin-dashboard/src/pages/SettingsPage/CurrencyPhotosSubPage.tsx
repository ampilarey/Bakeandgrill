import { useEffect, useRef, useState } from 'react';
import { Btn } from '../../components/SharedUI';
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
    : face === 10 ? 'coin-0.10.webp'
    : face === 5 ? 'coin-0.05.webp'
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

      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        These photos appear on the POS <strong>Close shift</strong> cash count. Upload a clear,
        straight-on photo of each note or coin (PNG/JPG/WebP). Landscape works best for notes,
        square for coins. Reset removes your photo and restores the built-in one.
      </p>

      {error && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 10 }}>{error}</p>}
      {okMsg && <p style={{ color: 'var(--color-success-strong)', fontSize: 13, marginBottom: 10 }}>{okMsg}</p>}
      {loading && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</p>}

      {/* Settings audit, 2026-10-09: fourteen cards in one column, each with
          a solid rust button, ran to 3,300px on a phone. Two to a row there,
          five or six on a computer, and the buttons are the quiet kind. */}
      <div className="currency-grid">
        {CURRENCY_FACES.map(({ face, label, kind }) => {
          const customUrl = custom[String(face)];
          const src = customUrl ?? bundledUrl(face);
          const busy = busyFace === face;
          return (
            <div key={face} className="currency-card" data-testid={`currency-card-${face}`}>
              <div className="currency-card-head">
                <span className="currency-card-name">{label}</span>
                <span className={customUrl ? 'currency-card-tag currency-card-tag--custom' : 'currency-card-tag'}>
                  {customUrl ? 'Custom' : 'Default'}
                </span>
              </div>
              <div className="currency-card-photo">
                <img
                  src={src}
                  alt={label}
                  className={kind === 'note' ? 'currency-card-note' : 'currency-card-coin'}
                />
              </div>
              <div className="currency-card-actions">
                <Btn variant="secondary" small type="button" disabled={busy} onClick={() => pickFile(face)}>
                  {busy ? 'Working…' : customUrl ? 'Replace' : 'Upload'}
                </Btn>
                {customUrl && (
                  <Btn variant="ghost" small type="button" disabled={busy} onClick={() => void onReset(face)}>
                    Reset
                  </Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
