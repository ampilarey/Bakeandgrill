import { useEffect, useRef } from 'react';
import { useServiceStatusContext } from '../context/ServiceStatusContext';
import { NotifyMeForm } from './NotifyMeForm';

/**
 * Modal that appears whenever a gated write returns 503 SERVICE_UNAVAILABLE
 * (or a caller opens it explicitly). Hosts the NotifyMeForm and the list of
 * alternatives so the customer always has a next step.
 *
 * Alternatives (from backend) render as pill buttons — recognised shortcodes
 * are `pickup`, `delivery`, `call`, `menu`, `track`, `cod`. Unknown values
 * render as plain-text hints so admins can add ad-hoc suggestions safely.
 */
type Alternative = { label: string; href?: string; onClick?: () => void };

function alternativesFor(input: string[]): Alternative[] {
  const site = (typeof window !== 'undefined' ? window.__BG_PUBLIC_PHONE__ : undefined) ?? '+9609120011';
  const map: Record<string, Alternative> = {
    pickup: { label: 'Order pickup instead', href: '/order/menu' },
    delivery: { label: 'Try delivery', href: '/order/menu' },
    call: { label: 'Call the café', href: `tel:${site.replace(/\s+/g, '')}` },
    menu: { label: 'Back to the menu', href: '/order/menu' },
    track: { label: 'Track an existing order', href: '/order/order-history' },
    cod: { label: 'Pay cash on collection', href: '/order/menu' },
  };
  return input.map((raw) => {
    const key = raw.trim().toLowerCase();
    return map[key] ?? { label: raw };
  });
}

export function ServiceUnavailableModal() {
  const { unavailableTarget, closeUnavailableModal } = useServiceStatusContext();
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!unavailableTarget) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUnavailableModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [unavailableTarget, closeUnavailableModal]);

  if (!unavailableTarget) return null;

  const { serviceKey, message, alternatives, notifyEnabled } = unavailableTarget;
  const options = alternativesFor(alternatives);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-unavailable-title"
      data-testid="service-unavailable-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(15, 10, 5, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeUnavailableModal();
      }}
    >
      <div
        style={{
          background: 'var(--color-surface, #fff)',
          borderRadius: 16,
          maxWidth: 460,
          width: '100%',
          padding: '1.5rem 1.25rem 1.25rem',
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h2 id="service-unavailable-title" style={{ margin: '0 0 0.4rem', fontSize: '1.15rem', fontWeight: 800 }}>
          Service temporarily unavailable
        </h2>
        <p style={{ margin: '0 0 0.75rem', color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          {message}
        </p>
        <p style={{ margin: '0 0 1rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <code style={{ background: 'var(--color-surface-alt, #f1f5f9)', padding: '2px 6px', borderRadius: 4 }}>
            {serviceKey}
          </code>
        </p>

        {options.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: notifyEnabled ? 16 : 8 }}>
            {options.map((opt, i) =>
              opt.href ? (
                <a
                  key={i}
                  href={opt.href}
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '0.65rem 1rem',
                    minHeight: 44,
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    background: 'var(--color-surface, #fff)',
                    color: 'var(--color-text)',
                    fontWeight: 700,
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                  }}
                >
                  {opt.label}
                </a>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={opt.onClick}
                  style={{
                    padding: '0.65rem 1rem',
                    minHeight: 44,
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ),
            )}
          </div>
        )}

        {notifyEnabled && (
          <div
            style={{
              borderTop: '1px solid var(--color-border)',
              paddingTop: 12,
              marginBottom: 12,
            }}
          >
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700 }}>
              Get an SMS when it&apos;s back
            </p>
            <NotifyMeForm serviceKey={serviceKey} compact />
          </div>
        )}

        <button
          ref={closeBtnRef}
          type="button"
          onClick={closeUnavailableModal}
          style={{
            display: 'block',
            width: '100%',
            minHeight: 44,
            padding: '0.65rem 1rem',
            border: 'none',
            borderRadius: 10,
            background: 'var(--color-surface-alt, #f1f5f9)',
            color: 'var(--color-text)',
            fontFamily: 'inherit',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __BG_PUBLIC_PHONE__?: string;
  }
}
