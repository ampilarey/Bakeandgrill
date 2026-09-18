import { useRef, useState } from 'react';
import { Btn } from './SharedUI';
import { deleteInventoryPhoto, uploadInventoryPhoto } from '../api/operations';

/*
 * The picture of an ingredient itself. Owner, 2026-09-18: "is there any
 * option to add inventory item photo - not brand". Brand photos say which
 * packet; this says which thing, on the stock list, the kitchen's request
 * and receiving screens, the buying list and the recipe editor.
 */

/** A small square picture of the item, or nothing when it has none. */
export function ItemThumb({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt={name}
      title={name}
      data-testid="inventory-item-thumb"
      style={{
        width: size, height: size, objectFit: 'cover', borderRadius: 8, flexShrink: 0,
        border: '1px solid var(--color-border)', background: 'var(--color-bg)',
      }}
    />
  );
}

export function InventoryItemPhoto({ itemId, itemName, photoUrl, canManage, onChanged }: {
  itemId: number;
  itemName: string;
  photoUrl: string | null;
  canManage: boolean;
  onChanged: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const res = await uploadInventoryPhoto(itemId, file);
      onChanged(res.photo_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the picture.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove the picture of ${itemName}?`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteInventoryPhoto(itemId);
      onChanged(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the picture.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="inventory-item-photo" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={itemName}
          style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: 96, height: 96, borderRadius: 12, border: '1px dashed var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)', fontSize: 11, textAlign: 'center', padding: 8,
          }}
        >
          No picture yet
        </div>
      )}
      <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Picture of {itemName}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          The thing itself, whatever packet it comes in. Shown on the stock list, the kitchen&rsquo;s request and
          receiving screens, the buying list and the recipe editor. Brands keep their own pictures below.
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={`Choose a picture of ${itemName}`}
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
            />
            <Btn small variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? 'Saving…' : photoUrl ? 'Replace picture' : 'Add picture'}
            </Btn>
            {photoUrl && (
              <Btn small variant="ghost" onClick={() => void remove()} disabled={busy}>Remove</Btn>
            )}
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</div>}
      </div>
    </div>
  );
}
