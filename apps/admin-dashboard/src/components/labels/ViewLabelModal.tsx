import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { fetchLabelLayouts, stickerLinks, type StickerSummary } from '../../api';
import { Button } from '../ui';
import { Modal, ModalActions } from '../SharedUI';
import { startingSize, type PrintTarget } from './PrintLabelModal';
import { SheetPreview } from './SheetPreview';
import { requestFor, sizeName, sizeOf, type SizeChoice } from './labelSize';

/*
 * A look at a label without opening its editor or printing it (owner, 2026-11-14: "Do i need to open every
 * time. Is there any view option"). The first sticker, drawn at the size the label prints at, with today's dates.
 */
export function ViewLabelModal({ target, onClose, onPrint }: { target: PrintTarget; onClose: () => void; onPrint?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<StickerSummary | null>(null);
  const [size, setSize] = useState<{ choice: SizeChoice; w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const lay = await fetchLabelLayouts();
        const { choice, roll } = startingSize(target, lay.presets, lay.rolls ?? []);
        const { w, h } = sizeOf(choice, lay.presets);
        if (alive) setSize({ choice, w, h });
        const r = await stickerLinks({ items: [{ id: target.id, copies: 1, kind: target.kind }], lang: target.lang, ...requestFor(choice, lay.presets), fill: true, roll, preview: true });
        if (!alive) return;
        setUrl(r.one_url ?? r.url);
        setSummary(r.summary ?? null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not draw the label.');
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const w = summary?.w ?? size?.w ?? 105;
  const h = summary?.h ?? size?.h ?? 148;
  const round = size?.choice.shape === 'circle';
  return (
    <Modal title={target.name} onClose={onClose} maxWidth={640}>
      <div data-testid="view-label">
        <div className={round ? 'max-w-[300px] mx-auto' : 'max-w-[520px] mx-auto'}>
          <SheetPreview url={url} ratio={w / h} busy={url === null && error === null} round={round} title="The label" empty={error ?? 'Drawing…'} />
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-2 text-center">{size ? `${sizeName(size.choice.shape, w, h)}. ` : ''}Shown with today's dates. Nothing is printed.</p>
      </div>
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {onPrint && <Button icon={<Printer size={16} />} onClick={onPrint} data-testid="view-label-print">Print</Button>}
      </ModalActions>
    </Modal>
  );
}
