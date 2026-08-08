import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ActiveOrderProvider } from '../../context/ActiveOrderContext';
import { useLanguage } from '../../context/LanguageContext';
import { ShellNavProvider, useShellNav } from '../../context/ShellNavContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { useCart } from '../../context/CartContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { getCustomerMe } from '../../api';
import { isEventFlowPath } from '../../utils/eventFlowPath';
import { BottomNav } from './BottomNav';
import { FloatingCartBar } from './FloatingCartBar';
import { TopNav } from './TopNav';
import { DESKTOP_SHELL_MQ } from './navTabs';

function AppShellChrome() {
  const { t } = useLanguage();
  const { settings: s } = useSiteSettingsContext();
  const { hideNav } = useShellNav();
  const { cart } = useCart();
  const location = useLocation();
  const isDesktopShell = useMediaQuery(DESKTOP_SHELL_MQ);
  const cartCount = cart.reduce((n, e) => n + e.quantity, 0);
  const showCartChrome = cartCount > 0 && !hideNav && !isEventFlowPath(location.pathname);

  const annEnabled = s.announcement_enabled === 'true';
  const annText = (s.announcement_text || '').trim();
  const annUrl = (s.announcement_url || '').trim();
  const annStyle = s.announcement_style || 'info';

  const annBgMap: Record<string, string> = {
    info: 'var(--color-primary-light)',
    warning: 'var(--color-warning-bg)',
    promo: 'var(--color-success-bg)',
  };
  const annColorMap: Record<string, string> = {
    info: 'var(--color-primary)',
    warning: 'var(--color-warning)',
    promo: 'var(--color-success)',
  };
  const annBorderMap: Record<string, string> = {
    info: 'var(--color-primary-light)',
    warning: 'var(--color-warning-bg)',
    promo: 'var(--color-success-bg)',
  };

  const shellClass = [
    'app-shell',
    isDesktopShell ? 'app-shell--desktop' : '',
    showCartChrome ? 'app-shell--with-cart' : '',
    hideNav ? 'app-shell--hide-nav' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass}>
      {/* AnalyticsTracker stays in SiteSettingsProvider (single mount). */}

      <a href="#main-content" className="skip-link">
        {t('common.skip_content')}
      </a>

      {isDesktopShell && <TopNav />}

      {annEnabled && annText && (
        <div
          role="status"
          aria-label={t('a11y.announcement')}
          style={{
            width: '100%',
            padding: '0.55rem 1.25rem',
            background: annBgMap[annStyle] || annBgMap.info,
            borderBottom: `1px solid ${annBorderMap[annStyle] || annBorderMap.info}`,
            color: annColorMap[annStyle] || annColorMap.info,
            fontSize: '0.85rem',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {annUrl ? (
            <a
              href={annUrl}
              style={{
                color: 'inherit',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              {annText} <span style={{ opacity: 0.7 }}>→</span>
            </a>
          ) : (
            annText
          )}
        </div>
      )}

      <main className="app-shell__main" id="main-content">
        <Outlet />
      </main>

      <FloatingCartBar />
      {!isDesktopShell && <BottomNav />}
    </div>
  );
}

function AuthNameHydration() {
  const { isAuthenticated, customerName, clearAuth, authReady, setAuth } = useAuth();

  useEffect(() => {
    let cancelled = false;
    if (isAuthenticated && !customerName && authReady) {
      getCustomerMe()
        .then((r) => {
          if (cancelled) return;
          const raw = r.customer.phone ?? r.customer.name ?? '';
          const n = r.customer.phone ? raw.replace(/^\+?960/, '') : raw;
          if (n) setAuth(n);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const status = (err as { status?: number })?.status;
          if (status === 401 || status === 403) {
            clearAuth();
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, customerName, authReady, setAuth, clearAuth]);

  return null;
}

/**
 * App chrome: TopNav (≥768) or BottomNav (phone), outlet, floating cart FAB.
 * No global marketing footer (rehomed to Account / BrandFooter).
 */
export function AppShell() {
  return (
    <ShellNavProvider>
      <ActiveOrderProvider>
        <AuthNameHydration />
        <AppShellChrome />
      </ActiveOrderProvider>
    </ShellNavProvider>
  );
}
