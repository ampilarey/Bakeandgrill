import type { ReactNode } from 'react';
import { useSiteSettings } from '../context/SiteSettingsContext';

type Props = {
  /** Content placed on the right side of the header (e.g. Live pill, back button) */
  rightSlot?: ReactNode;
  /** If provided, shows a small back button on the left before the logo */
  onBack?: () => void;
  backLabel?: string;
};

/**
 * Branded sticky header matching the main Blade site and Layout.tsx header.
 * Shows the CMS logo + site name. Used by standalone pages (OrderStatusPage, CheckoutPage).
 */
export function BrandedHeader({ rightSlot, onBack, backLabel = '← Menu' }: Props) {
  const s = useSiteSettings();
  const siteName = s.site_name || 'Bake & Grill';
  const logoUrl  = s.logo      || '/logo.png';

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'var(--color-header-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div className="order-header-inner" style={{ justifyContent: 'space-between', gap: '0.75rem' }}>
        {/* Left: optional back + logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-primary)',
                fontSize: '0.875rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                padding: '6px 8px',
                borderRadius: '8px',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
              aria-label={backLabel}
            >
              {backLabel}
            </button>
          )}

          <a
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              textDecoration: 'none',
              flexShrink: 0,
            }}
            aria-label={`${siteName} — Back to main site`}
          >
            <img
              src={logoUrl}
              alt={siteName}
              width={38}
              height={38}
              style={{ borderRadius: '9px', objectFit: 'cover' }}
              fetchPriority="high"
              decoding="async"
            />
            <span
              style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                color: 'var(--color-dark)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {siteName}
            </span>
          </a>
        </div>

        {/* Right slot */}
        {rightSlot && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {rightSlot}
          </div>
        )}
      </div>
    </header>
  );
}
