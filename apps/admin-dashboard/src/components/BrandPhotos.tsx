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
  // A brand can be recorded without a picture, and a price row or a purchase
  // line has nothing useful to say about that — it just shows the name.
  if (!photo.url) return null;

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

  /*
   * Owner, 2026-09-09: "i want to save more than one brand, and photo is
   * optional." The brand on its own is worth recording — it reaches the
   * buying screens as something to pick rather than spell — so it saves
   * without a picture, and the picture can follow whenever somebody is next
   * standing in front of the tin.
   */
  const upload = async (file?: File | null) => {
    const name = brand.trim();
    if (!name) {
      setError('Type the brand first.');
      return;
    }
    setBusy(true);
    try {
      await uploadBrandPhoto(itemId, name, file);
      setBrand('');
      await load();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the brand.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /** Adding a picture to a brand already on the list, without retyping it. */
  const addPictureTo = (photo: BrandPhoto) => {
    setBrand(photo.brand);
    setError('');
    // The value is read back by the change handler, which trims `brand` — set
    // here rather than passed, so one code path saves in both cases.
    window.setTimeout(() => fileRef.current?.click(), 0);
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

  // Brands bought before that are not on this list at all — the ones worth
  // adding. A brand recorded here without a picture is already on it.
  const missing = knownBrands.filter(
    (b) => !(photos ?? []).some((p) => p.brand.trim().toLowerCase() === b.trim().toLowerCase()),
  );

  return (
    <div data-testid="brand-photos">
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
        Brands
      </p>
      {/* Owner, 2026-09-09: "how to add more than one brand?", then "photo is
          optional". It was one box that looked like a limit of one, and a
          picture you could not skip. The brand is the fact; the picture is
          the extra that makes a shelf recognisable. */}
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
        As many brands as you buy. Type one and press Save brand — the box clears for the
        next. A picture is optional and can follow later; where there is one it shows on
        the buying list and on a purchase order line, so whoever is at the shop can see
        which packet to pick up.
      </p>

      {error && <ErrorMsg message={error} />}

      {photos === null ? <Spinner /> : (
        <>
          {photos.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
              No brands yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }} data-testid="brand-photo-list">
              {photos.map((p) => (
                <div key={p.id} style={{ width: 96 }} data-testid={`brand-photo-${p.id}`}>
                  {p.url ? (
                    <BrandThumb photo={p} size={96} onClick={() => setZoom(p)} />
                  ) : (
                    // A brand with no picture is still a brand. Say so plainly
                    // rather than leaving a gap that looks like a failed image.
                    <div
                      data-testid={`brand-no-photo-${p.id}`}
                      style={{
                        width: 96, height: 96, borderRadius: 8, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                        border: '1px dashed var(--color-border)', background: 'var(--color-bg)',
                        color: 'var(--color-text-muted)', fontSize: 11, padding: 6,
                      }}
                    >
                      No picture
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, wordBreak: 'break-word' }}>{p.brand}</div>
                  {canManage && !p.url && (
                    <Btn variant="ghost" small onClick={() => addPictureTo(p)} aria-label={`Add a picture for ${p.brand}`}>
                      Add picture
                    </Btn>
                  )}
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
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void upload(null); } }}
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
              {/* Saving the brand comes first, because that is the part that
                  is always wanted. The picture is the same save with a file. */}
              <Btn small onClick={() => void upload(null)} disabled={busy} data-testid="brand-save">
                {busy ? 'Saving…' : 'Save brand'}
              </Btn>
              <Btn small variant="secondary" onClick={pick} disabled={busy} data-testid="brand-photo-add">
                {busy ? 'Saving…' : 'Take or choose a picture'}
              </Btn>
              {missing.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Bought before, not on this list: {missing.slice(0, 4).join(', ')}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {/* Only a tile with a picture opens this, but the type allows none. */}
      {zoom?.url && (
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
