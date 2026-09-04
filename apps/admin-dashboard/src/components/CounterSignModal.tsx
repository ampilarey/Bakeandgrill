/* eslint-disable local/no-hex-in-inline-style -- the sign is printed in a
   bare popup window where the dashboard's CSS variables do not exist, so
   its colours have to be literal. */
import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal, ModalActions, Btn } from './SharedUI';

/**
 * A printable "show your code" sign for the counter.
 *
 * Owner, 2026-09-02: customers need to know to open the app and show their
 * code so the till can scan it. The sign carries a QR that opens the
 * account page in the order app, where their own code is, and the plain
 * link for anyone who would rather type it.
 */
export function counterSignUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/order/account`;
}

export function CounterSignModal({ onClose }: { onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const url = counterSignUrl(typeof window !== 'undefined' ? window.location.origin : 'https://bakeandgrill.mv');

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank', 'width=800,height=1000');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Counter sign</title>
      <style>
        @page { size: A5 portrait; margin: 12mm; }
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; color: #1C1408; }
        .sign { width: 124mm; min-height: 180mm; margin: 0 auto; text-align: center; display: flex; flex-direction: column; justify-content: center; gap: 8mm; }
      </style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.setTimeout(() => { win.print(); win.close(); }, 250);
  };

  return (
    <Modal title="Counter sign" onClose={onClose} maxWidth={560} footer={(
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        <Btn onClick={handlePrint} data-testid="counter-sign-print">Print (A5)</Btn>
      </ModalActions>
    )}>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        Stand this at the till. The QR opens the customer&apos;s account in the order app, where their own code is; the
        cashier scans that code to put the order on their account and add their points.
      </p>
      <div ref={printRef} data-testid="counter-sign">
        <div className="sign" style={{ textAlign: 'center', padding: 24, border: '1px solid var(--color-border)', borderRadius: 16, background: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#D4813A' }}>Bake &amp; Grill</div>
          <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.1, margin: '10px 0 6px', color: '#1C1408' }}>Earn points on every order</div>
          <div style={{ fontSize: 15, color: '#6B5D4F', lineHeight: 1.5, margin: '0 0 18px' }}>
            Open your account in our app and show your code to the cashier.
          </div>
          <div style={{ display: 'inline-block', padding: 12, background: '#fff', border: '1px solid #E8E0D8', borderRadius: 14 }}>
            <QRCodeSVG value={url} size={220} level="M" />
          </div>
          <div style={{ fontSize: 13, color: '#6B5D4F', marginTop: 14, lineHeight: 1.5 }}>
            Scan to open your account<br />
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1C1408' }}>{url.replace(/^https?:\/\//, '')}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
