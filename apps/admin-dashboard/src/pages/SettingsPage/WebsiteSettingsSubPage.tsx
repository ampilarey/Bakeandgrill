import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, LayoutTemplate, Printer, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../../components/ui';
import { Btn } from '../../components/SharedUI';

/**
 * Settings → Website: dine-in QR utility only.
 * Branding / default photo / new-items window live in Content & Branding hub.
 */
export function WebsiteSettings() {
  const toast = useToast();

  const dineInUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/menu';
    return `${window.location.origin}/menu`;
  }, []);

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(dineInUrl);
      toast.success('Dine-in menu link copied.');
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div
        data-testid="dinein-menu-card"
        style={{
          padding: 24, borderRadius: 14, background: 'var(--color-surface)',
          border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-text)', fontWeight: 700, fontSize: 16 }}>
          <QrCode size={18} /> Dine-in menu
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          View-only digital menu for QR codes and print — no login or ordering.
        </p>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            data-testid="dinein-menu-qr"
            style={{
              padding: 10, borderRadius: 12, background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', lineHeight: 0,
            }}
          >
            <QRCodeSVG value={dineInUrl} size={128} level="M" includeMargin={false} />
          </div>
          <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <code
              data-testid="dinein-menu-url"
              style={{
                display: 'block', padding: '10px 12px', borderRadius: 10,
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                fontSize: 12, wordBreak: 'break-all', color: 'var(--color-text)',
              }}
            >
              {dineInUrl}
            </code>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn type="button" onClick={() => void onCopyLink()} style={{ minHeight: 44 }}>
                <Copy size={14} /> Copy link
              </Btn>
              <Btn
                type="button"
                variant="secondary"
                onClick={() => window.open(dineInUrl, '_blank', 'noopener,noreferrer')}
                style={{ minHeight: 44 }}
              >
                <ExternalLink size={14} /> Open
              </Btn>
              <Btn
                type="button"
                variant="secondary"
                onClick={() => {
                  const w = window.open(dineInUrl, '_blank', 'noopener,noreferrer');
                  if (w) {
                    w.addEventListener('load', () => {
                      try { w.print(); } catch { /* ignore */ }
                    });
                  }
                }}
                style={{ minHeight: 44 }}
              >
                <Printer size={14} /> Print
              </Btn>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        padding: 24, borderRadius: 14, background: 'var(--color-surface)',
        border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-text)', fontWeight: 700, fontSize: 16 }}>
          <LayoutTemplate size={18} /> Content &amp; Branding
        </div>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Logo, default item photo, new-items window, hero slides, and all marketing copy
          are edited in Content &amp; Branding.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            to="/content?group=Branding"
            style={{
              height: 44, padding: '0 16px', borderRadius: 10,
              background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: 14,
              display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', fontFamily: 'inherit',
            }}
          >
            <LayoutTemplate size={16} /> Open Branding
          </Link>
        </div>
      </div>
    </div>
  );
}
