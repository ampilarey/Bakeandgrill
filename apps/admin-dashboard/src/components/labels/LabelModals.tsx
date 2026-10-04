import { useEffect, useState } from 'react';
import { fetchProductionStickers } from '../../api';
import { Modal } from '../SharedUI';
import { StickerPrintPanel } from './StickerPrintPanel';
import { BoxLabelPanel } from './BoxLabelPanel';

/*
 * The Label Hub's shortcuts (docs/LABEL_HUB_PLAN.md §7.3): stickers for a
 * production line with its batch, expiry and quantity filled, and the box
 * label for a wholesale delivery.
 */

export function ProductionStickersModal({ productionItemId, onClose }: { productionItemId: number; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchProductionStickers>>['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProductionStickers(productionItemId).then((r) => setData(r.data)).catch((e) => setError(e instanceof Error ? e.message : 'Could not read that line.'));
  }, [productionItemId]);

  return (
    <Modal title="Print stickers" onClose={onClose} maxWidth={640}>
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {data && !data.item && <p className="text-sm text-[var(--color-text-secondary)]">This line is not a menu item, so it has no sticker.</p>}
      {data?.item && !data.item.label_enabled && (
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">{data.item.name} is not switched on for labels yet; it will print with whatever label settings it has. Switch it on in Labels → Settings.</p>
      )}
      {data?.item && (
        <StickerPrintPanel
          fixedItems={[{ id: data.item.id, name: data.item.name }]}
          productionItemId={data.pi}
          defaults={{ batch: data.batch, exp: data.exp, mfg: data.mfg, qty: null, fill: true }}
        />
      )}
    </Modal>
  );
}

export function DeliveryBoxLabelModal({ deliveryId, onClose }: { deliveryId: number; onClose: () => void }) {
  return (
    <Modal title="Box label" onClose={onClose} maxWidth={720}>
      <BoxLabelPanel deliveryId={deliveryId} />
    </Modal>
  );
}
