import { useEffect, useRef, useState } from 'react';
import { FileUp, Plus, Trash2 } from 'lucide-react';
import {
  checkInvoicePo, createInvoice, generateInvoicePdf, uploadInvoicePoFile,
  type Invoice, type PoInvoicedBefore,
} from '../../api/finance';
import { Btn, ErrorMsg, InlineIcon, Modal, ModalActions, Switch } from '../SharedUI';
import { inputFont } from '../../utils/cssVars';
import { today } from '../../utils/dateHelpers';
import { readPo, sumOf, type PoDraft } from './readPo';
import { pdfLines } from './pdfText';
import { ocrLines } from './ocrText';

/*
 * An invoice from a customer's purchase order (owner, 2026-11-15: "a place
 * where I can upload PO and generate invoice").
 *
 * Pick the PO's PDF; it is read here in the browser and every value lands in a
 * box that can be changed. Nothing is saved until Create invoice: the PO file
 * is then kept with the invoice, which carries the PO's number, where to
 * deliver and by when. A scan or a photo is read from the picture
 * (`ocrText.ts`) and says so, since a scan can be misread; one that cannot be
 * read at all is typed, and the picture is still kept with the invoice.
 */

type Line = { description: string; quantity: string; unit: string; unit_price: string };

type Form = {
  po_number: string;
  bill_to: string;
  bill_address: string;
  bill_tin: string;
  bill_email: string;
  deliver_to: string;
  delivery_date: string;
  issue_date: string;
  due_date: string;
  gst_percent: string;
  tax_invoice: boolean;
  terms: string;
  notes: string;
};

const blankForm = (): Form => ({
  po_number: '', bill_to: '', bill_address: '', bill_tin: '', bill_email: '', deliver_to: '',
  delivery_date: '', issue_date: today(), due_date: '', gst_percent: '0', tax_invoice: false, terms: '', notes: '',
});

const blankLine = (): Line => ({ description: '', quantity: '1', unit: '', unit_price: '' });

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The PO's own GST as a percentage of its taxable amount; 0 when it charges none. */
export function gstPercentOf(draft: Pick<PoDraft, 'subtotal' | 'tax'>): string {
  if (!draft.tax || !draft.subtotal || draft.subtotal <= 0) return '0';
  return String(Math.round((draft.tax / draft.subtotal) * 1000) / 10);
}

export function formOf(draft: PoDraft): Form {
  return {
    ...blankForm(),
    po_number: draft.po_number,
    bill_to: draft.bill_to,
    bill_address: draft.bill_address,
    bill_tin: draft.bill_tin,
    bill_email: draft.bill_email,
    deliver_to: draft.deliver_to,
    delivery_date: draft.delivery_date,
    gst_percent: gstPercentOf(draft),
    terms: draft.payment_term ? `Payment term: ${draft.payment_term}` : '',
  };
}

const box = inputFont({
  width: '100%', minHeight: 44, padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 10,
  fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--color-surface)', color: 'var(--color-text)',
});

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'po-field po-field--wide' : 'po-field'}>
      <span className="po-label">{label}</span>
      {children}
    </label>
  );
}

export function PoInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (invoice: Invoice) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<PoDraft | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  /** The values came from a scan or a photo, which can be misread. */
  const [scanned, setScanned] = useState(false);
  /** 0 to 1 while a scan is being read; null otherwise. */
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(blankForm);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [before, setBefore] = useState<PoInvoicedBefore[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState<Invoice | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const fill = (draft: PoDraft) => {
    setRead(draft);
    setForm(formOf(draft));
    setLines(draft.lines.length > 0
      ? draft.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), unit: l.unit, unit_price: l.unit_price.toFixed(2) }))
      : [blankLine()]);
  };

  const found = (draft: PoDraft) => draft.lines.length > 0 || draft.po_number !== '';

  const choose = async (picked: File | null) => {
    if (!picked) return;
    setFile(picked); setError(''); setRead(null); setUnreadable(false); setScanned(false); setScanProgress(null);
    const isPdf = picked.type === 'application/pdf' || /\.pdf$/i.test(picked.name);
    setReading(true);
    try {
      // A PDF made by a computer carries its own text: that is exact, so it is tried first.
      if (isPdf) {
        const draft = await pdfLines(picked).then(readPo).catch(() => null);
        if (draft && found(draft)) { fill(draft); return; }
      }
      // A scan or a photo is a picture: its words are worked out from the picture.
      setScanProgress(0);
      const draft = readPo(await ocrLines(picked, setScanProgress));
      if (found(draft)) { fill(draft); setScanned(true); } else { setUnreadable(true); }
    } catch {
      setUnreadable(true);
    } finally {
      setReading(false);
      setScanProgress(null);
    }
  };

  // A PO billed before is named as soon as its number is known.
  useEffect(() => {
    const number = form.po_number.trim();
    if (number === '') { setBefore([]); return; }
    let live = true;
    const t = setTimeout(() => {
      checkInvoicePo(number).then((r) => { if (live) setBefore(r.invoices); }).catch(() => { if (live) setBefore([]); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [form.po_number]);

  const rows = lines
    .map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unit: l.unit.trim(), unit_price: Number(l.unit_price) }))
    .filter((l) => l.description !== '');
  const subtotal = sumOf(rows.filter((l) => Number.isFinite(l.quantity) && Number.isFinite(l.unit_price)));
  const gst = Math.max(0, Number(form.gst_percent) || 0);
  const tax = Math.round(subtotal * gst) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const poTotal = read?.total ?? null;
  const differs = poTotal !== null && Math.abs(poTotal - total) > 0.009;

  const create = async () => {
    if (rows.length === 0) { setError('Add at least one item.'); return; }
    if (rows.some((l) => !(l.quantity > 0) || !(l.unit_price >= 0) || !Number.isFinite(l.unit_price))) {
      setError('Every item needs a quantity and a price.'); return;
    }
    if (form.bill_to.trim() === '') { setError('Say who the invoice is for.'); return; }
    if (form.tax_invoice && form.bill_tin.trim() === '') { setError('A tax invoice needs the customer’s TIN.'); return; }
    setSaving(true); setError('');
    try {
      const kept = file ? (await uploadInvoicePoFile(file)).path : undefined;
      const res = await createInvoice({
        type: 'sale',
        recipient_name: form.bill_to.trim(),
        recipient_address: form.bill_address.trim() || undefined,
        recipient_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.bill_email.trim()) ? form.bill_email.trim() : undefined,
        customer_tin: form.bill_tin.trim() || undefined,
        is_tax_invoice: form.tax_invoice || undefined,
        issue_date: form.issue_date,
        due_date: form.due_date || undefined,
        tax_rate_bp: Math.round(gst * 100),
        notes: form.notes.trim() || undefined,
        terms: form.terms.trim() || undefined,
        po_number: form.po_number.trim() || undefined,
        po_file: kept,
        deliver_to: form.deliver_to.trim() || undefined,
        delivery_date: form.delivery_date || undefined,
        items: rows.map((l) => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, unit: l.unit || undefined })),
      });
      setMade(res.invoice);
      onCreated(res.invoice);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!made) return;
    setPdfBusy(true);
    try {
      const blob = await generateInvoicePdf(made.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${made.invoice_number}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  };

  if (made) {
    return (
      <Modal title="Invoice created" onClose={onClose} maxWidth={440}>
        {error && <ErrorMsg message={error} />}
        <p className="po-done" data-testid="po-done">
          <strong>{made.invoice_number}</strong> for MVR {money(made.total)}
          {made.po_number ? <> against PO {made.po_number}</> : null}. It is in the invoice list.
        </p>
        <ModalActions>
          <Btn variant="ghost" onClick={onClose}>Done</Btn>
          <Btn onClick={() => void downloadPdf()} disabled={pdfBusy}>{pdfBusy ? 'Making the PDF…' : 'Download the invoice'}</Btn>
        </ModalActions>
      </Modal>
    );
  }

  const started = file !== null && !reading;

  return (
    <Modal title="Invoice from a PO" onClose={onClose} maxWidth={720}>
      {error && <ErrorMsg message={error} />}

      <input
        ref={pick}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        data-testid="po-file"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => { void choose(e.target.files?.[0] ?? null); e.target.value = ''; }}
      />

      <div className="po-pick">
        <Btn variant={file ? 'secondary' : 'primary'} onClick={() => pick.current?.click()} disabled={reading}>
          <InlineIcon icon={FileUp} />{file ? 'Choose another PO' : 'Choose the PO (PDF)'}
        </Btn>
        <span className="po-pick__name">
          {reading
            ? (scanProgress === null ? 'Reading the PO…' : `Reading the scan… ${Math.round(scanProgress * 100)}%`)
            : file ? file.name : 'The customer’s purchase order: the PDF they sent, a scan, or a photo of it.'}
        </span>
      </div>

      {started && unreadable && (
        <p className="po-note po-note--warn" data-testid="po-unreadable">
          This file could not be read. A sharper, straighter scan or photo may work; or type the details below. The file is still kept with the invoice.
        </p>
      )}
      {started && read && read.missing.length > 0 && (
        <p className="po-note po-note--warn">Not found on the PO: {read.missing.join(', ')}. Type what is missing.</p>
      )}
      {started && read && scanned && (
        <p className="po-note po-note--warn" data-testid="po-scanned">
          Read from a scan. A scan can be misread, mostly in numbers: check every box against the PO, and that the totals match.
          {read.mended > 0 && ` ${read.mended} smudged ${read.mended === 1 ? 'figure was' : 'figures were'} worked out from the row’s amount.`}
        </p>
      )}
      {started && read && !scanned && read.missing.length === 0 && (
        <p className="po-note" data-testid="po-read">Read from the PO. Check each box before you create the invoice.</p>
      )}
      {before.length > 0 && (
        <p className="po-note po-note--warn" data-testid="po-before">
          This PO already has {before.length === 1 ? 'an invoice' : 'invoices'}: {before.map((b) => `${b.invoice_number} (MVR ${money(b.total)})`).join(', ')}.
          Create another only if it is a second delivery.
        </p>
      )}

      {started && (
        <>
          <div className="po-grid">
            <Field label="PO number">
              <input style={box} value={form.po_number} onChange={(e) => set('po_number', e.target.value)} data-testid="po-number" />
            </Field>
            <Field label="Invoice date">
              <input type="date" className="po-date" style={box} value={form.issue_date} onChange={(e) => set('issue_date', e.target.value)} />
            </Field>
            <Field label="Bill to" wide>
              <input style={box} value={form.bill_to} onChange={(e) => set('bill_to', e.target.value)} data-testid="po-bill-to" />
            </Field>
            <Field label="Their address" wide>
              <input style={box} value={form.bill_address} onChange={(e) => set('bill_address', e.target.value)} />
            </Field>
            <Field label="Their TIN">
              <input style={box} value={form.bill_tin} onChange={(e) => set('bill_tin', e.target.value)} data-testid="po-tin" />
            </Field>
            <Field label="Their email">
              <input type="email" style={box} value={form.bill_email} onChange={(e) => set('bill_email', e.target.value)} />
            </Field>
            <Field label="Deliver to" wide>
              <input style={box} value={form.deliver_to} onChange={(e) => set('deliver_to', e.target.value)} />
            </Field>
            <Field label="Delivery date">
              <input type="date" className="po-date" style={box} value={form.delivery_date} onChange={(e) => set('delivery_date', e.target.value)} />
            </Field>
            <Field label="Pay by (optional)">
              <input type="date" className="po-date" style={box} min={form.issue_date} value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
            </Field>
          </div>

          <div className="po-items">
            <div className="po-items__head">
              <span className="po-label">Items</span>
              <Btn small variant="secondary" onClick={() => setLines((ls) => [...ls, blankLine()])}><InlineIcon icon={Plus} />Add an item</Btn>
            </div>
            {lines.map((line, i) => {
              const amount = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
              const edit = (patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
              return (
                <div className="po-item" key={i} data-testid="po-item">
                  <input style={box} className="po-item__name" aria-label={`Item ${i + 1} name`} placeholder="What it is" value={line.description} onChange={(e) => edit({ description: e.target.value })} />
                  <input style={box} type="number" inputMode="decimal" min="0" step="any" aria-label={`Item ${i + 1} quantity`} placeholder="Qty" value={line.quantity} onChange={(e) => edit({ quantity: e.target.value })} />
                  <input style={box} aria-label={`Item ${i + 1} unit`} placeholder="Unit" value={line.unit} onChange={(e) => edit({ unit: e.target.value })} />
                  <input style={box} type="number" inputMode="decimal" min="0" step="0.01" aria-label={`Item ${i + 1} price`} placeholder="Price" value={line.unit_price} onChange={(e) => edit({ unit_price: e.target.value })} />
                  <span className="po-item__amount">{money(amount)}</span>
                  <Btn small variant="danger-outline" aria-label={`Remove item ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    <Trash2 size={15} aria-hidden />
                  </Btn>
                </div>
              );
            })}
          </div>

          <div className="po-grid">
            <Field label="GST %">
              <input style={box} type="number" inputMode="decimal" min="0" max="100" step="0.1" value={form.gst_percent} onChange={(e) => set('gst_percent', e.target.value)} data-testid="po-gst" />
            </Field>
            <div className="po-field">
              <span className="po-label">Tax invoice</span>
              <span className="po-switch">
                <Switch checked={form.tax_invoice} onChange={(v) => set('tax_invoice', v)} aria-label="Tax invoice" />
                <span>{form.tax_invoice ? 'Numbered in your GST series and entered in the GST ledger' : 'An ordinary invoice'}</span>
              </span>
            </div>
            <Field label="Terms" wide>
              <input style={box} value={form.terms} onChange={(e) => set('terms', e.target.value)} />
            </Field>
            <Field label="Note on the invoice (optional)" wide>
              <input style={box} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </div>

          <div className="po-totals" data-testid="po-totals">
            <span>Subtotal <strong>MVR {money(subtotal)}</strong></span>
            <span>GST <strong>MVR {money(tax)}</strong></span>
            <span className="po-totals__total">Total <strong>MVR {money(total)}</strong></span>
            {poTotal !== null && (
              <span className={differs ? 'po-totals__check po-totals__check--off' : 'po-totals__check'} data-testid="po-match">
                {differs ? `The PO says MVR ${money(poTotal)}. Check the items and GST.` : 'Matches the PO’s total.'}
              </span>
            )}
          </div>
        </>
      )}

      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => void create()} disabled={!started || saving} data-testid="po-create">
          {saving ? 'Creating…' : 'Create invoice'}
        </Btn>
      </ModalActions>
    </Modal>
  );
}
