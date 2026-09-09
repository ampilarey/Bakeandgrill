import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, ErrorMsg, Spinner } from './SharedUI';
import {
  deleteBrandPhoto, getBrandPhotos, uploadBrandPhoto, type BrandPhoto,
} from '../api/operations';

/*
 * Pictures of the brands an ingredient gets bought as. Owner, 2026-09-09:
 * "can i upload a pic of different brand of item to know which brand is
 * this." Eggs come as three brands and only the packet tells them apart, so
 * the person sent to the shop needs to see the packet, not read a name.
 *
 * Brand stays free text on the purchase line. This only hangs a photo off
 * the item-and-brand pair that the data already has.
 */

/** A small square picture with the brand under it. */
export function BrandThumb({ photo, size = 44, onClick }: {
  photo: Pick<BrandPhoto, 'brand' | 'url'>;
  size?: number;
  onClick?: () => void;
}) {
  return (
    <img
      src={photo.url}
      alt={photo.brand}
      title={photo.brand}
      onClick={onClick}
      data-testid={`brand-thumb-${photo.brand}`}
      style={{
        width: size, height: size, objectFit: 'cover', borderRadius: 8,
        border: '1px solid var(--color-border)', background: 'var(--color-bg)',
        cursor: onClick ? 'zoom-in' : undefined, flexShrink: 0,
      }}
    />
  );
}

export function BrandPhotos({ itemId, itemName, canManage, knownBrands = [] }: {
  itemId: number;
  itemName: string;
  canManage: boolean;
  /** Brands already bought, offered so the spelling matches the purchase lines. */
  knownBrands?: string[];
}) {
  const [photos, setPhotos] = useState<BrandPhoto[] | null>(null);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<BrandPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await getBrandPhotos(itemId);
      setPhotos(res.photos);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the brand photos.');
      setPhotos([]);
    }
  }, [itemId]);

  useEffect(() => { void load(); }, [load]);

  const pick = () => {
    if (!brand.trim()) {
      setError('Type the brand first, then choose the picture.');
      return;
    }
    setError('');
    fileRef.current?.click();
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadBrandPhoto(itemId, brand.trim(), file);
      setBrand('');
      await load();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the picture.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (photo: BrandPhoto) => {
    if (!window.confirm(`Remove the ${photo.brand} picture for ${itemName}?`)) return;
    try {
      await deleteBrandPhoto(itemId, photo.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the picture.');
    }
  };

  // Brands bought before that have no picture yet — the useful ones to add.
  const missing = knownBrands.filter(
    (b) => !(photos ?? []).some((p) => p.brand.trim().toLowerCase() === b.trim().toLowerCase()),
  );

  return (
    <div data-testid="brand-photos">
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
        Brand photos
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
        One picture per brand, so whoever is at the shop can see which packet to pick up. It shows on the buying list and on a purchase order line.
      </p>

      {error && <ErrorMsg message={error} />}

      {photos === null ? <Spinner /> : (
        <>
          {photos.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
              No brand pictures yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              {photos.map((p) => (
                <div key={p.id} style={{ width: 96 }} data-testid={`brand-photo-${p.id}`}>
                  <BrandThumb photo={p} size={96} onClick={() => setZoom(p)} />
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, wordBreak: 'break-word' }}>{p.brand}</div>
                  {canManage && (
                    <Btn variant="ghost" small onClick={() => void remove(p)} aria-label={`Remove ${p.brand} picture`}>
                      Remove
                    </Btn>
                  )}
                </div>
              ))}
            </div>
          )}

          {canManage && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input
                list={`brands-${itemId}`}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Brand name"
                aria-label="Brand for the picture"
                style={{
                  height: 38, padding: '0 10px', minWidth: 160,
                  border: '1.5px solid var(--color-border)', borderRadius: 8,
                  background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13,
                }}
              />
              <datalist id={`brands-${itemId}`}>
                {knownBrands.map((b) => <option key={b} value={b} />)}
              </datalist>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(e) => void upload(e.target.files?.[0])}
                style={{ display: 'none' }}
                data-testid="brand-photo-file"
              />
              <Btn small onClick={pick} disabled={busy} data-testid="brand-photo-add">
                {busy ? 'Saving…' : 'Take or choose a picture'}
              </Btn>
              {missing.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Bought before, no picture yet: {missing.slice(0, 4).join(', ')}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {zoom && (
        <div
          onClick={() => setZoom(null)}
          role="dialog"
          aria-label={`${zoom.brand} picture`}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <img src={zoom.url} alt={zoom.brand} style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 12 }} />
            <div style={{ color: '#fff', fontWeight: 700, marginTop: 10 }}>{zoom.brand}</div>
          </div>
        </div>
      )}
    </div>
  );
}
