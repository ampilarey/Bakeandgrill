import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { getContentMedia, type ContentMediaItem } from '../../api/content';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
};

/** Browse previously uploaded content images under /storage/site. */
export function MediaLibrary({ open, onClose, onPick }: Props) {
  const [items, setItems] = useState<ContentMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr('');
    void getContentMedia()
      .then((res) => setItems(res.items || []))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load media'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-testid="media-library"
      role="dialog"
      aria-modal="true"
      aria-label="Media library"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(28,20,8,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '80vh',
          overflow: 'auto',
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #E8E0D8',
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1C1408', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ImageIcon size={18} /> Media library
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 10,
              border: '1px solid #E8E0D8',
              background: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
        {loading ? <p style={{ color: '#9C8E7E' }}>Loading media…</p> : null}
        {err ? <p style={{ color: '#B91C1C' }}>{err}</p> : null}
        {!loading && !err && items.length === 0 ? (
          <p style={{ color: '#9C8E7E', fontSize: 13 }}>
            No uploaded content images yet. Upload from a block to populate the library.
          </p>
        ) : null}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: 10,
          }}
        >
          {items.map((item) => (
            <button
              key={item.url}
              type="button"
              onClick={() => {
                onPick(item.url);
                onClose();
              }}
              style={{
                border: '1px solid #E8E0D8',
                borderRadius: 10,
                padding: 6,
                background: '#F8F6F3',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <img
                src={item.thumb_url || item.url}
                alt=""
                style={{ width: '100%', height: '72px', objectFit: 'cover', borderRadius: 8 }}
              />
              <div
                style={{
                  fontSize: 10,
                  color: '#6B5D4F',
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.name}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
