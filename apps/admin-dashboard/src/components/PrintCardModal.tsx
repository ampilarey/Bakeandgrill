import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal, ModalActions, Btn, Select } from './SharedUI';

export type PrintCardData = {
  type: 'gift_card' | 'promo' | 'discount_card';
  code: string;
  title: string;           // e.g. "Gift Card" or promo name
  subtitle?: string;       // e.g. "MVR 50.00" or "20% OFF"
  expiry?: string | null;  // ISO date string
  note?: string;           // e.g. "Valid on all orders"
  logoText?: string;       // brand name shown on card
};

type CardSize = {
  label: string;
  widthMm: number;
  heightMm: number;
  description: string;
};

const SIZES: CardSize[] = [
  { label: 'CR80 (Credit Card)',  widthMm: 85.6, heightMm: 54,   description: 'Standard credit card size' },
  { label: 'CR79',                widthMm: 84,   heightMm: 53.5, description: 'Slightly smaller than CR80' },
  { label: 'Half Card',           widthMm: 85.6, heightMm: 27,   description: 'Half credit card height' },
  { label: 'Business Card',       widthMm: 89,   heightMm: 51,   description: 'Standard business card' },
  { label: 'Square (63mm)',       widthMm: 63,   heightMm: 63,   description: 'Square format' },
];

const MM_TO_PX = 3.78; // 96 dpi → mm conversion

function CardFace({ data, size }: { data: PrintCardData; size: CardSize }) {
  const w = size.widthMm * MM_TO_PX;
  const h = size.heightMm * MM_TO_PX;
  const isGift = data.type === 'gift_card';
  const isDiscountCard = data.type === 'discount_card';
  const accent = isGift ? 'var(--color-primary)' : isDiscountCard ? '#2A1E0C' : '#1C5F3A';
  const qrSize = Math.min(h * 0.45, 72);
  const expiry = data.expiry ? new Date(data.expiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  return (
    <div
      style={{
        width: w, height: h,
        background: 'var(--color-surface)',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div style={{ background: accent, height: h * 0.32, padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: Math.max(7, h * 0.09), fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
          {data.logoText ?? 'Bake & Grill'}
        </div>
        <div style={{ color: '#fff', fontSize: Math.max(9, h * 0.13), fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>
          {data.title}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', gap: 8, padding: '8px 12px', alignItems: 'center' }}>
        {/* Left: value + code + expiry */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, minWidth: 0 }}>
          {data.subtitle && (
            <div style={{ color: accent, fontSize: Math.max(11, h * 0.18), fontWeight: 900, lineHeight: 1, letterSpacing: -0.5 }}>
              {data.subtitle}
            </div>
          )}
          <div style={{ background: '#F5F0EB', borderRadius: 4, padding: '3px 7px', display: 'inline-block', width: 'fit-content' }}>
            <span style={{ fontSize: Math.max(8, h * 0.11), fontWeight: 700, letterSpacing: 2, color: 'var(--color-text)', fontFamily: 'monospace' }}>
              {data.code}
            </span>
          </div>
          {data.note && (
            <div style={{ fontSize: Math.max(6, h * 0.09), color: 'var(--color-text-muted)', lineHeight: 1.2 }}>
              {data.note}
            </div>
          )}
          {expiry && (
            <div style={{ fontSize: Math.max(6, h * 0.09), color: 'var(--color-text-muted)' }}>
              Expires: {expiry}
            </div>
          )}
        </div>

        {/* Right: QR code */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ background: 'var(--color-surface)', padding: 3, borderRadius: 4, border: '1px solid var(--color-border)' }}>
            <QRCodeSVG value={data.code} size={qrSize} level="M" />
          </div>
          <div style={{ fontSize: Math.max(5, h * 0.08), color: '#C0B4A8' }}>Scan or enter code</div>
        </div>
      </div>
    </div>
  );
}

export function PrintCardModal({
  data,
  onClose,
}: {
  data: PrintCardData;
  onClose: () => void;
}) {
  const [sizeIdx, setSizeIdx] = useState(0);
  const [copies, setCopies] = useState(1);
  const printRef = useRef<HTMLDivElement>(null);

  const size = SIZES[sizeIdx];

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Card — ${data.code}</title>
        <style>
          @page { margin: 10mm; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; background: #fff; }
          .card-wrap {
            display: inline-block;
            margin: 4mm;
            width: ${size.widthMm}mm;
            height: ${size.heightMm}mm;
            break-inside: avoid;
          }
          .card-wrap > div { width: ${size.widthMm}mm !important; height: ${size.heightMm}mm !important; }
          .print-grid { display: flex; flex-wrap: wrap; align-items: flex-start; }
        </style>
      </head>
      <body>
        <div class="print-grid">
          ${Array.from({ length: copies }).map(() => `<div class="card-wrap">${content.innerHTML}</div>`).join('')}
        </div>
        <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
      </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <Modal title="Print Card" onClose={onClose} maxWidth={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Card Size</label>
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
              options={[1,2,3,4,5,6,8,10,20].map((n) => ({ value: String(n), label: `${n} cop${n === 1 ? 'y' : 'ies'}` }))}
            />
          </div>
        </div>

        {/* Preview */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Preview</div>
          <div
            style={{
              background: '#F5F0EB',
              borderRadius: 10,
              padding: 20,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 140,
            }}
          >
            <div ref={printRef}>
              <CardFace data={data} size={size} />
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
            {size.widthMm} × {size.heightMm} mm — actual print size
          </div>
        </div>
      </div>

      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handlePrint}>🖨️ Print {copies > 1 ? `${copies} Copies` : 'Card'}</Btn>
      </ModalActions>
    </Modal>
  );
}
