import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal, ModalActions, Btn, Select } from './SharedUI';
import { fetchTableQr, rotateTableQr, type RestaurantTable, type TableQr } from '../api';

/*
 * The card that sits on the table.
 *
 * Paper has no theme. Everything inside `CardFace` is printed — the markup is
 * serialised into a separate window that carries none of this app's
 * stylesheets, so a `var(--color-…)` there would resolve to nothing and print
 * black on black. These are the ink colours, deliberately literal, and they
 * are the only place in this file where that is true: the modal chrome around
 * the preview uses the usual tokens.
 */
const INK = '#1C1408';
const INK_MUTED = '#6B5D4F';
const PAPER = '#FFFFFF';
const ACCENT = '#D4813A';

type CardSize = {
  label: string;
  widthMm: number;
  heightMm: number;
  description: string;
};

const SIZES: CardSize[] = [
  { label: 'Table tent (A6)', widthMm: 105, heightMm: 148, description: 'Folded card that stands on the table' },
  { label: 'Small tent', widthMm: 74, heightMm: 105, description: 'A7 — half the tent, for crowded tables' },
  { label: 'Sticker', widthMm: 70, heightMm: 70, description: 'Square, for sticking flat to the table' },
];

const MM_TO_PX = 3.78; // 96 dpi

function CardFace({ name, url, size }: { name: string; url: string; size: CardSize }) {
  const w = size.widthMm * MM_TO_PX;
  const h = size.heightMm * MM_TO_PX;
  // The QR has to survive a phone held at arm's length in low light, so it
  // takes as much of the card as the wording leaves it.
  const qr = Math.min(w * 0.72, h * 0.46);

  return (
    <div
      style={{
        width: w,
        height: h,
        background: PAPER,
        border: `2px solid ${ACCENT}`,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: h * 0.03,
        padding: '6% 8%',
        boxSizing: 'border-box',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: Math.max(9, h * 0.045), fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: ACCENT }}>
        Bake &amp; Grill
      </div>
      <div style={{ fontSize: Math.max(20, h * 0.11), fontWeight: 900, lineHeight: 1, color: INK }}>
        Table {name}
      </div>
      <QRCodeSVG value={url} size={qr} level="M" bgColor={PAPER} fgColor={INK} />
      <div style={{ fontSize: Math.max(10, h * 0.05), fontWeight: 800, lineHeight: 1.25, color: INK }}>
        Scan to order
      </div>
      <div style={{ fontSize: Math.max(7, h * 0.032), lineHeight: 1.3, color: INK_MUTED }}>
        Point your camera here. We bring it to this table — no queue, no app.
      </div>
    </div>
  );
}

/** One print window, whatever is being printed: one table or the whole floor. */
function printCards(title: string, size: CardSize, html: string) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @page { margin: 8mm; size: A4; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #fff; }
        .print-grid { display: flex; flex-wrap: wrap; align-items: flex-start; }
        .card-wrap {
          margin: 3mm;
          width: ${size.widthMm}mm;
          height: ${size.heightMm}mm;
          break-inside: avoid;
        }
        .card-wrap > div { width: ${size.widthMm}mm !important; height: ${size.heightMm}mm !important; }
      </style>
    </head>
    <body>
      <div class="print-grid">${html}</div>
      <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
    </body>
    </html>
  `);
  win.document.close();
}

/**
 * The QR for one table: look at it, print it, or replace it.
 *
 * Rotating is the interesting action. It invalidates the card currently on
 * that table — which is the point when one is photographed or walks off — so
 * it asks first, and says plainly that the old card stops working.
 */
export function TableQrModal({ table, onClose }: { table: RestaurantTable; onClose: () => void }) {
  const [qr, setQr] = useState<TableQr | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sizeIdx, setSizeIdx] = useState(0);
  const [copies, setCopies] = useState(1);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const size = SIZES[sizeIdx];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchTableQr(table.id);
        if (!cancelled) setQr(res);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [table.id]);

  const handleRotate = async () => {
    setRotating(true);
    setError('');
    try {
      setQr(await rotateTableQr(table.id));
      setConfirmRotate(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRotating(false);
    }
  };

  const handleCopy = () => {
    if (!qr) return;
    void navigator.clipboard?.writeText(qr.url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => { /* clipboard blocked — the link is on screen anyway */ });
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    printCards(
      `Table ${table.name} — QR`,
      size,
      Array.from({ length: copies }).map(() => `<div class="card-wrap">${content.innerHTML}</div>`).join(''),
    );
  };

  return (
    <Modal title={`QR for Table ${table.name}`} onClose={onClose} maxWidth={560}>
      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{error}</p>}

      {loading ? (
        <p style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : !qr ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No QR available for this table.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Card size</label>
              <Select
                value={String(sizeIdx)}
                onChange={(v) => setSizeIdx(Number(v))}
                options={SIZES.map((s, i) => ({ value: String(i), label: `${s.label} (${s.widthMm}×${s.heightMm}mm)` }))}
              />
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>{size.description}</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Copies</label>
              <Select
                value={String(copies)}
                onChange={(v) => setCopies(Number(v))}
                options={[1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: `${n} cop${n === 1 ? 'y' : 'ies'}` }))}
              />
            </div>
          </div>

          <div
            style={{
              background: 'var(--color-bg)',
              borderRadius: 10,
              padding: 16,
              display: 'flex',
              justifyContent: 'center',
              overflow: 'auto',
            }}
          >
            <div ref={printRef} data-testid="table-qr-preview">
              <CardFace name={table.name} url={qr.url} size={size} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              What the QR opens
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code
                style={{
                  flex: 1, minWidth: 0, overflowX: 'auto', whiteSpace: 'nowrap',
                  fontSize: 12, padding: '7px 10px', borderRadius: 8,
                  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {qr.url}
              </code>
              <Btn small variant="secondary" onClick={handleCopy}>{copied ? 'Copied' : 'Copy'}</Btn>
            </div>
          </div>

          {confirmRotate ? (
            <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--color-danger)', background: 'var(--color-bg)' }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text)', lineHeight: 1.45 }}>
                A new code means the card on Table {table.name} <strong>stops working immediately</strong>.
                Print and place the new one before you walk away. No other table is affected.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn small variant="secondary" onClick={() => setConfirmRotate(false)}>Keep the current code</Btn>
                <Btn small variant="danger" onClick={handleRotate} disabled={rotating}>
                  {rotating ? 'Replacing…' : 'Replace the code'}
                </Btn>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRotate(true)}
              style={{
                alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0,
                fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                color: 'var(--color-text-muted)', textDecoration: 'underline',
              }}
            >
              Card lost or photographed? Replace this code
            </button>
          )}
        </div>
      )}

      <ModalActions>
        <Btn variant="secondary" onClick={onClose}>Close</Btn>
        <Btn onClick={handlePrint} disabled={!qr}>🖨️ Print {copies > 1 ? `${copies} cards` : 'card'}</Btn>
      </ModalActions>
    </Modal>
  );
}

/**
 * Every table's card on one sheet — how the floor gets set up the first time.
 *
 * Tokens are fetched per table rather than added to the tables list, so the
 * one thing that makes a scan trustworthy stays behind its own endpoint
 * instead of riding along in a payload the POS also reads.
 */
export function TableQrSheetModal({ tables, onClose }: { tables: RestaurantTable[]; onClose: () => void }) {
  const printable = useMemo(() => tables.filter((t) => t.is_active !== false), [tables]);
  const [codes, setCodes] = useState<Array<{ name: string; url: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sizeIdx, setSizeIdx] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  const size = SIZES[sizeIdx];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const results = await Promise.all(printable.map((t) => fetchTableQr(t.id)));
        if (!cancelled) setCodes(results.map((r) => ({ name: r.table.name, url: r.url })));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [printable]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const cards = Array.from(content.children)
      .map((child) => `<div class="card-wrap">${child.innerHTML}</div>`)
      .join('');
    printCards('Table QR codes', size, cards);
  };

  return (
    <Modal title="Print QR codes for every table" onClose={onClose} maxWidth={720}>
      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ maxWidth: 280 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Card size</label>
          <Select
            value={String(sizeIdx)}
            onChange={(v) => setSizeIdx(Number(v))}
            options={SIZES.map((s, i) => ({ value: String(i), label: `${s.label} (${s.widthMm}×${s.heightMm}mm)` }))}
          />
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-muted)' }}>
            Fetching {printable.length} code{printable.length === 1 ? '' : 's'}…
          </p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
              {codes.length} card{codes.length === 1 ? '' : 's'}, one per active table. Each card carries its own
              code — they are not interchangeable, so place them on the table they name.
            </p>
            <div
              ref={printRef}
              data-testid="table-qr-sheet"
              style={{
                display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
                background: 'var(--color-bg)', borderRadius: 10, padding: 16,
                maxHeight: 360, overflow: 'auto',
              }}
            >
              {codes.map((c) => (
                <div key={c.name}>
                  <CardFace name={c.name} url={c.url} size={size} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ModalActions>
        <Btn variant="secondary" onClick={onClose}>Close</Btn>
        <Btn onClick={handlePrint} disabled={loading || codes.length === 0}>
          🖨️ Print {codes.length} card{codes.length === 1 ? '' : 's'}
        </Btn>
      </ModalActions>
    </Modal>
  );
}
