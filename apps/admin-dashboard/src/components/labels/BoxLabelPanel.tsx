import { useEffect, useState } from 'react';
import { Printer, FileDown, AlertTriangle, Plus, X } from 'lucide-react';
import {
  boxLabelLinks, downloadLabelSheet, fetchDeliveryBoxLabel, fetchLabelProducts, fetchTradeDeliveries, openLabelSheet,
  type BoxFields, type LabelProduct, type SheetLinks, type TradeDelivery,
} from '../../api';
import { Button } from '../ui';

/*
 * The A4 box label: blank to write on, or filled from a wholesale delivery,
 * every field still free text. Boat, pick-up point and window are not on a
 * delivery; the last ones used are remembered per shop on this device.
 */

type Line = { id: number; qty: number; name: string };

type Props = {
  /** Opened from a delivery: fills from it straight away. */
  deliveryId?: number | null;
};

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';
const tripKey = (accountId: number) => `labels.boxTrip.${accountId}`;

export function BoxLabelPanel({ deliveryId = null }: Props) {
  const [deliveries, setDeliveries] = useState<TradeDelivery[]>([]);
  const [products, setProducts] = useState<LabelProduct[]>([]);
  const [delivery, setDelivery] = useState<number | null>(deliveryId);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [fields, setFields] = useState<BoxFields>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SheetLinks | null>(null);

  useEffect(() => {
    if (deliveryId == null) fetchTradeDeliveries({ page: 1 }).then((r) => setDeliveries(r.data)).catch(() => setDeliveries([]));
    fetchLabelProducts(true).then((r) => setProducts(r.data)).catch(() => setProducts([]));
  }, [deliveryId]);

  useEffect(() => {
    if (!delivery) return;
    setError(null);
    fetchDeliveryBoxLabel(delivery).then((r) => {
      let trip: BoxFields = {};
      try { trip = JSON.parse(localStorage.getItem(tripKey(r.data.trade_account_id)) || '{}') as BoxFields; } catch { /* none */ }
      setAccountId(r.data.trade_account_id);
      setFields({ ...r.data.fields, ...trip, when: r.data.fields.when });
      setLines(r.data.lines);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Could not read that delivery.'));
  }, [delivery]);

  const set = (key: keyof BoxFields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [key]: e.target.value }));

  const prepare = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await boxLabelLinks({ ...fields, delivery, lines: lines.map(({ id, qty }) => ({ id, qty })) });
      if (accountId) {
        try { localStorage.setItem(tripKey(accountId), JSON.stringify({ boat: fields.boat, boat2: fields.boat2, pickup: fields.pickup, pickup2: fields.pickup2, when2: fields.when2, contact: fields.contact })); } catch { /* private window */ }
      }
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the box label.');
    } finally {
      setBusy(false);
    }
  };

  const input = (key: keyof BoxFields, label: string, placeholder = '') => (
    <div>
      <label className={labelClass} htmlFor={`box-${key}`}>{label}</label>
      <input id={`box-${key}`} value={fields[key] ?? ''} placeholder={placeholder} onChange={set(key)} className={fieldClass} />
    </div>
  );

  return (
    <div className="space-y-5" data-testid="box-label-panel">
      {deliveryId == null && (
        <div>
          <label className={labelClass} htmlFor="box-delivery">Fill from a wholesale delivery (optional)</label>
          <select id="box-delivery" value={delivery ?? ''} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setDelivery(v); if (!v) { setFields({}); setLines([]); setAccountId(null); } }} className={fieldClass}>
            <option value="">Blank template, written by hand</option>
            {deliveries.map((d) => <option key={d.id} value={d.id}>{d.delivery_number}{d.shop_name ? ` · ${d.shop_name}` : ''}</option>)}
          </select>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        {input('customer', 'Deliver to', 'Leave empty to write by hand')}
        {input('attn', 'Attention')}
        <div className="sm:col-span-2">{input('contact', 'Role and phone', 'Central Purchasing Coordinator · +960 …')}</div>
        {input('boat', 'Boat')}
        {input('boat2', 'Boat (second line)')}
        {input('pickup', 'Pick-up point')}
        {input('pickup2', 'Pick-up point (second line)')}
        {input('when', 'Delivery date')}
        {input('when2', 'Delivery window', '8:00 AM – 2:00 PM')}
        {input('po', 'PO number')}
        <div className="grid grid-cols-2 gap-2">{input('box', 'Box')}{input('of', 'Of')}</div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">Contents</h3>
        {lines.length === 0 ? <p className="text-sm text-[var(--color-text-muted)] mb-2">No lines: the label prints eleven empty rows to write on.</p> : null}
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={`${l.id}-${i}`} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-[var(--color-text)] truncate">{l.name}</span>
              <input type="number" min={0} value={l.qty} onChange={(e) => setLines((s) => s.map((x, j) => (j === i ? { ...x, qty: Math.max(0, Number(e.target.value) || 0) } : x)))} className="w-24 h-10 min-h-[44px] px-2 rounded-lg border border-[var(--color-border)] text-sm text-right" aria-label={`Quantity of ${l.name} (0 to write by hand)`} />
              <button type="button" onClick={() => setLines((s) => s.filter((_, j) => j !== i))} className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]" aria-label={`Remove ${l.name}`}><X size={16} /></button>
            </div>
          ))}
        </div>
        {lines.length < 16 && (
          <div className="flex gap-2 mt-2">
            <select value={adding} onChange={(e) => setAdding(e.target.value)} className={fieldClass} aria-label="Add a line">
              <option value="">Add an item…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button variant="secondary" icon={<Plus size={16} />} disabled={!adding} onClick={() => { const p = products.find((x) => x.id === Number(adding)); if (p) setLines((s) => [...s, { id: p.id, qty: 0, name: p.name }]); setAdding(''); }}>Add</Button>
          </div>
        )}
        <p className="text-xs text-[var(--color-text-muted)] mt-2">A quantity of 0 leaves a line to write the count by hand. Three spare rows are always added.</p>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-[var(--color-danger)] text-sm text-[var(--color-danger)] bg-white">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {result ? (
        <section className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button icon={<Printer size={16} />} onClick={() => openLabelSheet(result.url)}>Print</Button>
            <Button variant="secondary" icon={<FileDown size={16} />} onClick={() => downloadLabelSheet(result.pdf_url)}>Download PDF</Button>
            <Button variant="ghost" onClick={() => setResult(null)}>Change</Button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">Print on A4 at actual size (100%). These links work for {result.expires_in_minutes} minutes.</p>
        </section>
      ) : (
        <Button onClick={prepare} loading={busy} icon={<Printer size={16} />} data-testid="box-prepare">Prepare box label</Button>
      )}
    </div>
  );
}
