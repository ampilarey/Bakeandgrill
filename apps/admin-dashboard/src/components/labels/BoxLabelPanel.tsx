import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, FileDown, AlertTriangle, X, ChevronUp, Save, CheckCircle2, Bookmark } from 'lucide-react';
import {
  boxLabelLinks, downloadLabelSheet, fetchDeliveryBoxLabel, fetchLabelJob, fetchLabelProducts, fetchLabelShops, fetchShopBoxLabel,
  fetchTradeDeliveries, openLabelSheet, renameLabelJob, saveShopBoxLabel,
  printsViaPdf,
  type BoxFields, type BoxPrefill, type LabelProduct, type LabelShop, type LabelStorage, type SheetLinks, type TradeDelivery,
} from '../../api';
import { Button } from '../ui';
import { QtyStepper } from './QtyStepper';

/*
 * The A4 box label. Owner, 2026-10-04: "Cant u add all in one place?" — a
 * shop's whole label lives with the shop: who it goes to, the boat, pick-up
 * point and window, and its own item list in its order with the article
 * names it checks boxes against. Pick the shop and it all fills in; pick a
 * delivery and its date and quantities go on top. Every field is still free
 * text, and "Save for this shop" keeps the changes for next time, on every
 * device.
 */

type Line = { id: number; qty: number; name: string; article: string; default_article: string };

type Props = {
  /** Opened from a delivery: fills from it straight away. */
  deliveryId?: number | null;
};

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';
const heading = 'text-sm font-bold text-[var(--color-text)] mb-2';

/** Same as the server's BoxLabel::defaultArticle, for a line added here. */
const defaultArticle = (name: string) => `FROZEN - SHORT EAT - ${name.toUpperCase()}-PIECE`;

export function BoxLabelPanel({ deliveryId = null }: Props) {
  const [shops, setShops] = useState<LabelShop[]>([]);
  const [deliveries, setDeliveries] = useState<TradeDelivery[]>([]);
  const [products, setProducts] = useState<LabelProduct[]>([]);
  const [shopId, setShopId] = useState<number | null>(null);
  const [delivery, setDelivery] = useState<number | null>(deliveryId);
  const [fields, setFields] = useState<BoxFields>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SheetLinks | null>(null);
  // v2 point 10: ?job=ID opens a saved box label back in this form.
  const [params] = useSearchParams();
  const jobParam = deliveryId == null ? params.get('job') : null;
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  useEffect(() => {
    if (!jobParam) return;
    Promise.all([fetchLabelJob(Number(jobParam)), fetchLabelProducts(true)]).then(([r, prods]) => {
      const q = r.data.request as Record<string, unknown>;
      const f: BoxFields = {};
      for (const k of ['customer', 'attn', 'contact', 'boat', 'boat2', 'pickup', 'pickup2', 'when', 'when2', 'po', 'box', 'of', 'heading', 'strip'] as const) {
        if (typeof q[k] === 'string') f[k] = q[k] as string;
      }
      if (q.storage === 'frozen' || q.storage === 'chilled' || q.storage === 'ambient') f.storage = q.storage;
      setFields(f);
      const names = new Map(prods.data.map((p) => [p.id, p.name]));
      const ls = Array.isArray(q.lines) ? (q.lines as { id: number; qty?: number; article?: string }[]) : [];
      setLines(ls.filter((l) => names.has(Number(l.id))).map((l) => ({ id: Number(l.id), qty: Number(l.qty ?? 0), name: names.get(Number(l.id)) ?? '', article: l.article ?? '', default_article: defaultArticle(names.get(Number(l.id)) ?? '') })));
      setDelivery(q.delivery ? Number(q.delivery) : null);
      setEditing({ id: r.data.id, name: r.data.name });
    }).catch(() => setError('That saved label could not be opened.'));
  }, [jobParam]);

  const rename = async (job: { id: number; name: string }) => {
    const name = window.prompt('Name for this saved label', job.name);
    if (!name || name.trim() === '' || name.trim() === job.name) return;
    try {
      const r = await renameLabelJob(job.id, name.trim());
      setResult((s) => (s && s.job?.id === job.id ? { ...s, job: { id: job.id, name: r.data.name } } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename it.');
    }
  };

  useEffect(() => {
    fetchLabelShops().then((r) => setShops(r.data)).catch(() => setShops([]));
    if (deliveryId == null) fetchTradeDeliveries({ page: 1 }).then((r) => setDeliveries(r.data)).catch(() => setDeliveries([]));
    fetchLabelProducts(true).then((r) => setProducts(r.data)).catch(() => setProducts([]));
  }, [deliveryId]);

  const apply = (p: BoxPrefill) => {
    setShopId(p.trade_account_id);
    setFields(p.fields);
    setLines(p.lines);
    setSaved(p.saved);
    setResult(null);
  };

  useEffect(() => {
    if (!delivery || jobParam) return;
    setError(null); setNotice(null);
    fetchDeliveryBoxLabel(delivery).then((r) => apply(r.data)).catch((e) => setError(e instanceof Error ? e.message : 'Could not read that delivery.'));
  }, [delivery]);

  const pickShop = (id: number | null) => {
    setDelivery(null); setNotice(null); setError(null); setResult(null);
    if (!id) { setShopId(null); setFields({}); setLines([]); setSaved(false); return; }
    setShopId(id);
    fetchShopBoxLabel(id).then((r) => apply(r.data)).catch((e) => setError(e instanceof Error ? e.message : 'Could not read that shop.'));
  };

  const set = (key: keyof BoxFields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [key]: e.target.value }));
  const setLine = (i: number, patch: Partial<Line>) => setLines((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const shopName = shops.find((s) => s.id === shopId)?.shop_name ?? (fields.customer || 'this shop');

  const prepare = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await boxLabelLinks({ ...fields, delivery, lines: lines.map(({ id, qty, article }) => ({ id, qty, article })) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the box label.');
    } finally {
      setBusy(false);
    }
  };

  const saveForShop = async () => {
    if (!shopId) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const { customer, attn, contact, boat, boat2, pickup, pickup2, when2, storage, heading: h, strip } = fields;
      const r = await saveShopBoxLabel(shopId, { customer, attn, contact, boat, boat2, pickup, pickup2, when2, storage, heading: h, strip, items: lines.map(({ id, article }) => ({ id, article })) });
      setSaved(r.data.saved);
      setShops((s) => s.map((x) => (x.id === shopId ? { ...x, saved: true } : x)));
      setNotice(`Saved. Next time pick ${shopName} and all of this fills in, with the quantities left for you.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const input = (key: keyof BoxFields, label: string, placeholder = '') => (
    <div>
      <label className={labelClass} htmlFor={`box-${key}`}>{label}</label>
      <input id={`box-${key}`} value={fields[key] ?? ''} placeholder={placeholder} onChange={set(key)} className={fieldClass} />
    </div>
  );

  const shownDeliveries = shopId ? deliveries.filter((d) => d.trade_account_id === shopId) : deliveries;

  return (
    <div className="space-y-5" data-testid="box-label-panel">
      {editing && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)] p-3 rounded-lg bg-[var(--color-bg)]" data-testid="box-editing">
          <Bookmark size={16} className="shrink-0 text-[var(--color-primary)]" />
          <span>Opened from saved label <strong className="text-[var(--color-text)]">{editing.name}</strong>. Change anything and press Prepare.</span>
        </p>
      )}
      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="box-shop">Shop</label>
          <select id="box-shop" value={shopId ?? ''} onChange={(e) => pickShop(e.target.value ? Number(e.target.value) : null)} className={fieldClass}>
            <option value="">No shop: blank, or typed in below</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.shop_name}{s.saved ? ' ✓' : ''}</option>)}
          </select>
          {shopId != null && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {saved ? 'Filled in from this shop’s saved box label.' : 'Nothing saved for this shop yet: fill it in once, then press Save.'}
            </p>
          )}
        </div>
        {deliveryId == null && (
          <div>
            <label className={labelClass} htmlFor="box-delivery">Delivery (optional: adds the date and quantities)</label>
            <select id="box-delivery" value={delivery ?? ''} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v) setDelivery(v); else pickShop(shopId); }} className={fieldClass}>
              <option value="">No delivery</option>
              {shownDeliveries.map((d) => <option key={d.id} value={d.id}>{d.delivery_number}{d.shop_name && !shopId ? ` · ${d.shop_name}` : ''}</option>)}
            </select>
          </div>
        )}
      </section>

      <section>
        <h3 className={heading}>Who it is for</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {input('customer', 'Deliver to', 'Leave empty to write by hand')}
          {input('attn', 'Attention')}
          <div className="sm:col-span-2">{input('contact', 'Role and phone', 'Central Purchasing Coordinator · +960 …')}</div>
        </div>
      </section>

      <section>
        <h3 className={heading}>Getting there</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {input('boat', 'Boat')}
          {input('boat2', 'Boat (second line)')}
          {input('pickup', 'Pick-up point')}
          {input('pickup2', 'Pick-up point (second line)')}
          {input('when', 'Delivery date', 'Sun, 4 Oct 2026')}
          {input('when2', 'Delivery window', '8:00 AM – 2:00 PM')}
        </div>
      </section>

      <section>
        <h3 className={heading}>Handling</h3>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <div>
            <label className={labelClass} htmlFor="box-storage">Keep it</label>
            <select id="box-storage" value={fields.storage ?? 'frozen'} onChange={(e) => setFields((f) => ({ ...f, storage: e.target.value as LabelStorage }))} className={fieldClass}>
              <option value="frozen">Frozen (-18°C)</option>
              <option value="chilled">Chilled (0–4°C)</option>
              <option value="ambient">Room temperature</option>
            </select>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Sets the badge, and the usual heading and strip.</p>
          </div>
          {input('heading', 'Heading under the name', 'Usual wording for this choice')}
          <div className="sm:col-span-2">{input('strip', 'Handling strip (bottom)', 'Usual wording for this choice')}</div>
        </div>
      </section>

      <section>
        <h3 className={heading}>This box</h3>
        <div className="grid gap-3 grid-cols-[1fr_72px_72px] sm:grid-cols-[1fr_120px_120px]">
          {input('po', 'PO number')}
          {input('box', 'Box')}
          {input('of', 'Of')}
        </div>
      </section>

      <section>
        <h3 className={heading}>Contents</h3>
        {lines.length === 0 ? <p className="text-sm text-[var(--color-text-muted)] mb-2">No lines: the label prints eleven empty rows to write on.</p> : null}
        {lines.length > 0 && (
          <div className="divide-y divide-[var(--color-border-light)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            {lines.map((l, i) => (
              <div key={`${l.id}-${i}`} className="px-3 py-2 bg-white space-y-2" data-testid="box-line">
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--color-text)]">{l.name}{l.qty === 0 && <span className="block text-xs font-normal text-[var(--color-text-muted)]">Written by hand</span>}</span>
                  <QtyStepper value={l.qty} min={0} onChange={(n) => setLine(i, { qty: n })} label={`Quantity of ${l.name} (0 to write by hand)`} />
                  <span className="inline-flex -mr-2">
                    <button type="button" disabled={i === 0} onClick={() => setLines((s) => { const n = [...s]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} className="w-11 h-11 hidden sm:inline-flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] disabled:opacity-30" aria-label={`Move ${l.name} up`}><ChevronUp size={16} /></button>
                    <button type="button" onClick={() => setLines((s) => s.filter((_, j) => j !== i))} className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]" aria-label={`Remove ${l.name}`}><X size={16} /></button>
                  </span>
                </div>
                <input value={l.article} maxLength={60} placeholder={l.default_article} onChange={(e) => setLine(i, { article: e.target.value })} className="h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-xs text-[var(--color-text)] w-full" aria-label={`Article name for ${l.name}`} />
              </div>
            ))}
          </div>
        )}
        {lines.length < 16 && (
          <select
            value=""
            onChange={(e) => { const p = products.find((x) => x.id === Number(e.target.value)); if (p) setLines((s) => [...s, { id: p.id, qty: 0, name: p.name, article: '', default_article: defaultArticle(p.name) }]); }}
            className={`${fieldClass} mt-2`}
            aria-label="Add a line"
          >
            <option value="">+ Add an item…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <p className="text-xs text-[var(--color-text-muted)] mt-2">A quantity of 0 leaves a line to write the count by hand; three spare rows are always added. Under each item, type the shop's own article name (BAJIYAA, H -GULHA); left empty, the usual name prints.</p>
      </section>

      {shopId != null && (
        <section className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-dashed border-[var(--color-border)]">
          <Button variant="secondary" icon={<Save size={16} />} onClick={saveForShop} loading={saving} data-testid="box-save-shop">Save for {shopName}</Button>
          <span className="text-xs text-[var(--color-text-muted)] flex-1 min-w-[180px]">Keeps the name, contact, boat, pick-up point, window, handling wording and the item list with article names. Not the date, PO or box numbers.</span>
        </section>
      )}
      {notice && <p role="status" className="flex items-start gap-2 text-sm text-[var(--color-success)]"><CheckCircle2 size={16} className="mt-0.5 shrink-0" />{notice}</p>}

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-[var(--color-danger)] text-sm text-[var(--color-danger)] bg-white">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {result ? (
        <section className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] space-y-3">
          {result.job && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              Saved as <strong>{result.job.name}</strong> on the Saved labels tab.{' '}
              <button type="button" className="underline text-[var(--color-primary)]" onClick={() => rename(result.job!)}>Rename</button>
            </p>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">{printsViaPdf() ? 'Print opens the PDF: use Share → Print on A4, and keep the scale at 100%, not "fit".' : 'Print on A4 at actual size (100%).'} These links work for {result.expires_in_minutes} minutes.</p>
          <div className="labels-actions">
            <div className="labels-actions-row flex flex-wrap gap-2">
              <Button icon={<Printer size={16} />} onClick={() => openLabelSheet(result.url, result.pdf_url)}>Print</Button>
              <Button variant="secondary" icon={<FileDown size={16} />} onClick={() => downloadLabelSheet(result.pdf_url)} aria-label="Download PDF"><span className="sm:hidden">PDF</span><span className="hidden sm:inline">Download PDF</span></Button>
              <Button variant="ghost" className="labels-actions-wide" onClick={() => setResult(null)}>Change</Button>
            </div>
          </div>
        </section>
      ) : (
        <div className="labels-actions">
          <div className="labels-actions-row flex">
            <Button onClick={prepare} loading={busy} icon={<Printer size={16} />} data-testid="box-prepare">Prepare box label</Button>
          </div>
        </div>
      )}
    </div>
  );
}
