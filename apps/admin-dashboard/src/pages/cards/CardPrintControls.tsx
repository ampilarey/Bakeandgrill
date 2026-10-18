import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { downloadBlob } from '@shared/api';
import { Btn, Input, Select } from '../../components/SharedUI';
import { cardPdf, type CardOutput, type CardSettings, type CardSides, type CardSourceRef } from '../../api/cards';
import { fetchDiscountCardBatches, type DiscountCardBatch } from '../../api/discount-cards';
import { fetchPromotions, type Promotion } from '../../api/marketing';
import { CARD_OUTPUTS, CARD_SIDES } from './cardSpec';

const box: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 };

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
  const picked = options.find((o) => o.value === value);
  return (
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
            style={{ height: 32, padding: '0 12px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--color-text)',
              border: `1.5px solid ${o.value === value ? 'var(--color-primary)' : 'var(--color-border)'}`, background: o.value === value ? 'var(--color-tone-rust-bg)' : 'var(--color-surface)' }}>
            {o.label}
          </button>
        ))}
      </div>
      {picked?.hint && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>{picked.hint}</p>}
    </div>
  );
}

/**
 * What goes on the cards, how they print, and the PDF. With `source` fixed (a Print
 * button on a gift card, a code or a batch), only the printing choices show.
 */
export function CardPrintControls({ settings, designId, source: fixed, onPrinted }: {
  settings: CardSettings;
  designId?: number | null;
  source?: CardSourceRef;
  onPrinted?: () => void;
}) {
  const kind = settings.kind;
  const [batches, setBatches] = useState<DiscountCardBatch[]>([]);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [batchId, setBatchId] = useState('');
  const [start, setStart] = useState('1');
  const [count, setCount] = useState('');
  const [promoId, setPromoId] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [copies, setCopies] = useState('1');
  const [output, setOutput] = useState<CardOutput>('card');
  const [sides, setSides] = useState<CardSides>(settings.back ? 'both' : 'front');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (fixed) return;
    if (kind === 'discount') fetchDiscountCardBatches(1).then((r) => setBatches(r.data ?? [])).catch(() => setMsg('Discount card batches need the Discount cards permission.'));
    if (kind === 'promo') fetchPromotions({ page: 1 }).then((r) => setPromos((r.data ?? []).filter((p) => p.code))).catch(() => setPromos([]));
  }, [fixed, kind]);

  useEffect(() => { if (!settings.back) setSides('front'); }, [settings.back]);

  const n = (s: string) => Math.max(1, Math.min(500, Number(s) || 1));
  let source: CardSourceRef | null = fixed ?? null;
  if (!fixed) {
    if (kind === 'discount') source = batchId ? { type: 'discount_batch', id: Number(batchId), start: n(start), ...(count ? { count: n(count) } : {}) } : null;
    else if (kind === 'promo') source = promoId ? { type: 'promotion', id: Number(promoId), copies: n(copies) } : null;
    else if (kind === 'gift') source = giftCode.trim() ? { type: 'gift_card', code: giftCode.trim(), copies: n(copies) } : null;
    else source = { type: 'none', copies: n(copies) };
  } else if (fixed.type !== 'discount_batch') {
    source = { ...fixed, copies: n(copies) } as CardSourceRef;
  }

  const print = async () => {
    if (!source) return;
    // The tab opens inside the tap, so a popup blocker lets it through.
    const tab = window.open('', '_blank');
    setBusy(true);
    setMsg('');
    try {
      const blob = await cardPdf({ settings, source, output, sides, design_id: designId ?? null });
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else downloadBlob(blob, `cards-${kind}.pdf`);
      setMsg('PDF ready. Print it at actual size (100%), with your card printer’s card size set to match.');
      onPrinted?.();
    } catch (e) {
      tab?.close();
      setMsg(e instanceof Error ? e.message : 'Could not make the PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={box} data-testid="card-print-controls">
      {!fixed && kind === 'discount' && (
        <div style={grid}>
          <Select label="Discount card batch" value={batchId} onChange={setBatchId}
            options={[{ value: '', label: batches.length ? 'Choose a batch…' : 'No batches yet: issue them under Discount cards' }, ...batches.map((b) => ({ value: String(b.id), label: `${b.name} · ${b.quantity} cards` }))]} />
          <Input label="From card number" type="number" inputMode="numeric" value={start} onChange={setStart} />
          <Input label="How many (blank: all)" type="number" inputMode="numeric" value={count} onChange={setCount} />
        </div>
      )}
      {!fixed && kind === 'promo' && (
        <Select label="Promo code" value={promoId} onChange={setPromoId}
          options={[{ value: '', label: promos.length ? 'Choose a promotion…' : 'No promotions with a code' }, ...promos.map((p) => ({ value: String(p.id), label: `${p.name} · ${p.code}` }))]} />
      )}
      {!fixed && kind === 'gift' && (
        <Input label="Gift card code (shown once, when the card is issued)" value={giftCode} onChange={setGiftCode} autoComplete="off" />
      )}
      {(!fixed || fixed.type !== 'discount_batch') && kind !== 'discount' && (
        <Input label="How many cards" type="number" inputMode="numeric" value={copies} onChange={setCopies} style={{ maxWidth: 200 }} />
      )}
      <Choice label="Print on" value={output} options={CARD_OUTPUTS} onChange={setOutput} />
      {settings.back && <Choice label="Sides" value={sides} options={CARD_SIDES} onChange={setSides} />}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn onClick={() => void print()} disabled={!source || busy}><Printer size={16} aria-hidden />{busy ? 'Making the PDF…' : 'Make PDF to print'}</Btn>
        {msg && <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{msg}</span>}
      </div>
    </div>
  );
}
