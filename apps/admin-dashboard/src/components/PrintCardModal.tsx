import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal, Select } from './SharedUI';
import { fetchCards, type CardDesign, type CardKind, type CardSettings, type CardSourceRef } from '../api/cards';
import { CardPreview } from '../pages/cards/CardPreview';
import { CardPrintControls } from '../pages/cards/CardPrintControls';

/**
 * Print a card from a gift card, a promo code or a discount card (owner, 2026-10-18).
 * Picks one of the saved card designs (Promotions → Printed cards) and makes the same
 * PDF as there: one card per page for any card printer, or an A4 sheet.
 */
export type PrintCardData = {
  kind: CardKind;
  source: CardSourceRef;
  /** What is being printed, for the pop-up's title ("Gift card", a promo's name). */
  label: string;
  /** A big line for a card with no code of its own, e.g. an automatic offer's "10% OFF". */
  headline?: string;
};

export function PrintCardModal({ data, onClose }: { data: PrintCardData; onClose: () => void }) {
  const [designs, setDesigns] = useState<CardDesign[]>([]);
  const [defaults, setDefaults] = useState<Partial<Record<CardKind, CardSettings>>>({});
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCards()
      .then((r) => {
        setDesigns(r.designs);
        setDefaults(r.defaults);
        const mine = r.designs.find((d) => d.settings.kind === data.kind);
        setPick(mine ? String(mine.id) : '');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the card designs.'));
  }, [data.kind]);

  const chosen = designs.find((d) => String(d.id) === pick);
  const base = chosen?.settings ?? defaults[data.kind];
  const settings: CardSettings | undefined = base && data.headline && !base.headline ? { ...base, headline: data.headline } : base;

  return (
    <Modal title={`Print card · ${data.label}`} onClose={onClose} maxWidth={720}>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Select label="Design" value={pick} onChange={setPick}
          options={[{ value: '', label: 'Standard design' }, ...designs.map((d) => ({ value: String(d.id), label: d.name }))]} />
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
          Make or change designs under <Link to="/promotions/cards" onClick={onClose}>Promotions → Printed cards</Link>.
        </p>
        {settings && <CardPreview settings={settings} source={data.source} />}
        {settings && <CardPrintControls settings={settings} designId={chosen?.id ?? null} source={data.source} />}
      </div>
    </Modal>
  );
}
