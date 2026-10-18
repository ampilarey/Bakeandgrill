import { useEffect, useRef, useState } from 'react';
import { previewCard, type CardSettings, type CardSourceRef } from '../../api/cards';

/**
 * The card's front and back as the server draws them (the same boxes as the PDF),
 * redrawn a moment after each change.
 */
export function CardPreview({ settings, source, onInfo }: {
  settings: CardSettings;
  source?: CardSourceRef;
  onInfo?: (info: { cards: number; a4PerPage: number }) => void;
}) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [height, setHeight] = useState(220);
  const frame = useRef<HTMLIFrameElement>(null);
  const key = JSON.stringify({ settings, source });
  const info = useRef(onInfo);
  info.current = onInfo;

  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      previewCard(settings, source)
        .then((r) => {
          if (!live) return;
          setHtml(r.html);
          setError('');
          info.current?.({ cards: r.cards, a4PerPage: r.a4_per_page });
        })
        .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Could not draw the card.'); });
    }, 350);
    return () => { live = false; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers settings and source
  }, [key]);

  // Grow the frame to the drawn cards once they load.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => {
      const doc = el.contentDocument;
      if (doc?.body) setHeight(Math.max(120, doc.body.scrollHeight + 4));
    };
    el.addEventListener('load', fit);
    return () => el.removeEventListener('load', fit);
  }, []);

  return (
    <div data-testid="card-preview" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-light)', borderRadius: 12, padding: 8 }}>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: 8 }}>{error}</p>}
      <iframe
        ref={frame}
        title="Card preview"
        sandbox="allow-same-origin"
        srcDoc={html}
        style={{ width: '100%', height, border: 0, display: 'block' }}
      />
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 8px 0' }}>Front and back, at true size on a normal screen. Sample code until you pick what goes on the cards.</p>
    </div>
  );
}
