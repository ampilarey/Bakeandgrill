import { useEffect, useRef, useState } from 'react';
import { Scissors, Trash2, Upload } from 'lucide-react';
import {
  CUTOUT_ACCEPT,
  deleteItemCutout,
  getItemCutout,
  normalizeBackdrop,
  sourceLabel,
  updateItemCutoutBackdrop,
  uploadItemCutout,
  type CutoutBackdrop,
  type ItemCutoutState,
} from '../../api/cutout';
import { CutoutBackdropField, CutoutPreview } from '../../components/CutoutBackdropField';
import { resolveMediaUrl } from './mediaUrl';

/**
 * The cut-out slot on the Photos tab (owner, 2026-10-01, after the ZUS
 * screenshots). One see-through PNG for the small cards, and the item's own
 * say over the circle behind it. The gallery below is untouched: an opened
 * item shows those photos, never this.
 */
export function CutoutSlot({ itemId }: { itemId: number }) {
  const [state, setState] = useState<ItemCutoutState | null>(null);
  const [draft, setDraft] = useState<CutoutBackdrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (next: ItemCutoutState) => {
    setState(next);
    setDraft(next.backdrop);
  };

  useEffect(() => {
    let alive = true;
    setError('');
    getItemCutout(itemId)
      .then((res) => { if (alive) apply(res); })
      .catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [itemId]);

  const upload = async (file: File) => {
    setBusy(true); setError(''); setSaved(false);
    try {
      apply(await uploadItemCutout(itemId, file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true); setError('');
    try {
      apply(await deleteItemCutout(itemId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveBackdrop = async () => {
    setBusy(true); setError(''); setSaved(false);
    try {
      apply(await updateItemCutoutBackdrop(itemId, normalizeBackdrop(draft)));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dirty = JSON.stringify(normalizeBackdrop(draft)) !== JSON.stringify(state?.backdrop ?? null);
  const effective = state?.effective ?? null;
  // What the item would get with nothing of its own: the level above it.
  const inheritedFrom = effective && effective.source !== 'item' ? sourceLabel[effective.source] : 'the category or the menu default';
  const inherited = effective && effective.source !== 'item' ? { color: effective.color, strength: effective.strength } : null;
  const cutoutSrc = state?.cutout_url ? resolveMediaUrl(state.cutout_url) : null;

  return (
    <section
      data-testid="cutout-slot"
      style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 12, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Scissors size={15} />
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Thumbnail cut-out</div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
        A PNG of the dish with the background removed. Menu cards float it over a circle and POS tiles show it on their own;
        the opened item keeps showing the photos below. Without a cut-out the cards use the main photo as now.
      </p>
      {error && <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <CutoutPreview
          src={cutoutSrc}
          color={effective?.color ?? '#F3EAE1'}
          strength={effective?.strength ?? 100}
          size={120}
          label="Cut-out preview"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            data-testid="cutout-upload-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'var(--color-surface)', border: '2px dashed var(--color-border)', borderRadius: 10, cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}
          >
            <Upload size={14} />
            {busy ? 'Working…' : state?.cutout_url ? 'Replace cut-out PNG' : 'Upload cut-out PNG'}
          </button>
          {state?.cutout_url && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              data-testid="cutout-remove-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-bg)', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--color-danger-strong)' }}
            >
              <Trash2 size={13} /> Remove cut-out
            </button>
          )}
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {state?.cutout_url ? 'Cards use this cut-out.' : 'No cut-out yet. Cards use the main photo.'}
          </span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={CUTOUT_ACCEPT}
          style={{ display: 'none' }}
          data-testid="cutout-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
      </div>

      {state && (
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>Circle behind it</div>
          <CutoutBackdropField
            value={draft}
            onChange={(next) => { setDraft(next); setSaved(false); }}
            inheritLabel={inheritedFrom}
            inherited={inherited}
            previewSrc={cutoutSrc}
            disabled={busy}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => void saveBackdrop()}
              disabled={busy || !dirty}
              data-testid="cutout-backdrop-save"
              style={{ padding: '6px 14px', whiteSpace: 'nowrap', flexShrink: 0, background: dirty ? 'var(--color-primary)' : 'var(--color-border-light)', color: dirty ? 'white' : 'var(--color-text-muted)', border: 'none', borderRadius: 8, cursor: busy || !dirty ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}
            >
              Save circle
            </button>
            {saved && !dirty && <span style={{ fontSize: 12, color: 'var(--color-success)' }}>Saved</span>}
            {effective && (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                Showing {effective.color} at {effective.strength}% from {sourceLabel[effective.source]}.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
