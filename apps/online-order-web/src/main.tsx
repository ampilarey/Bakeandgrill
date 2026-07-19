import * as Sentry from '@sentry/react';
import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SiteSettingsProvider } from './context/SiteSettingsContext';
import { LanguageProvider } from './context/LanguageContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { OrderModeProvider } from './context/OrderModeContext';
import { AppShell } from './components/shell/AppShell';
import { AbandonedCartTracker } from './components/AbandonedCartTracker';
import { ScrollToTop } from './components/ScrollToTop';
import './index.css';

// Apply saved theme before first paint — useTheme only mounts on Account.
try {
  document.documentElement.dataset.theme =
    localStorage.getItem('theme') === 'dark' ? 'dark' : '';
} catch {
  /* private mode / quota */
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
  });
}

// Lazily load all page components for code splitting
const HomePage         = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const MenuPage         = lazy(() => import('./pages/MenuPage').then((m) => ({ default: m.MenuPage })));
const AboutPage        = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const ContactPage      = lazy(() => import('./pages/ContactPage').then((m) => ({ default: m.ContactPage })));
const HoursPage        = lazy(() => import('./pages/HoursPage').then((m) => ({ default: m.HoursPage })));
const ReservationPage  = lazy(() => import('./pages/ReservationPage').then((m) => ({ default: m.ReservationPage })));
const CheckoutPage     = lazy(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const OrderStatusPage  = lazy(() => import('./pages/OrderStatusPage').then((m) => ({ default: m.OrderStatusPage })));
const CateringPage     = lazy(() => import('./pages/CateringPage').then((m) => ({ default: m.CateringPage })));
const PrivacyPage      = lazy(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const NotFoundPage     = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const OrderHistoryPage = lazy(() => import('./pages/OrderHistoryPage').then((m) => ({ default: m.OrderHistoryPage })));
const AccountPage      = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const RewardsPage      = lazy(() => import('./pages/RewardsPage').then((m) => ({ default: m.RewardsPage })));
const GiftCardsPage = lazy(() => import('./pages/GiftCardsPage').then((m) => ({ default: m.GiftCardsPage })));
const BuyGiftCardPage = lazy(() => import('./pages/BuyGiftCardPage').then((m) => ({ default: m.BuyGiftCardPage })));
const GiftCardPurchaseSuccessPage = lazy(() => import('./pages/GiftCardPurchaseSuccessPage').then((m) => ({ default: m.GiftCardPurchaseSuccessPage })));
const GiftCardViewPage = lazy(() => import('./pages/GiftCardViewPage').then((m) => ({ default: m.GiftCardViewPage })));

// Minimal fallback shown while a page chunk loads
function PageSkeleton() {
  return (
    <div className="order-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: 'var(--page-gutter)' }}>
      <div className="skeleton" style={{ height: '48px', borderRadius: '12px', maxWidth: '40%' }} />
      <div className="skeleton" style={{ height: '300px', borderRadius: '16px' }} />
      <div className="skeleton" style={{ height: '200px', borderRadius: '16px' }} />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in DOM');
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SiteSettingsProvider>
        <LanguageProvider>
          <CartProvider>
            <ToastProvider>
            <AuthProvider>
            <AbandonedCartTracker />
            <OrderModeProvider>
            <BrowserRouter basename="/order">
              <ScrollToTop />
              <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  {/* Standalone pages — no AppShell. /track/:token is the SMS
                      cold-open URL (path token; Laravel serves this SPA shell). */}
                  <Route path="checkout" element={<ErrorBoundary inline><CheckoutPage /></ErrorBoundary>} />
                  <Route path="track/:trackingToken" element={<ErrorBoundary inline><OrderStatusPage /></ErrorBoundary>} />
                  <Route path="orders/:orderId" element={<ErrorBoundary inline><OrderStatusPage /></ErrorBoundary>} />

                  {/* Public pages wrapped in AppShell (5-tab chrome) */}
                  <Route element={<AppShell />}>
                    <Route index element={<HomePage />} />
                    <Route path="menu" element={<MenuPage />} />
                    <Route path="about" element={<AboutPage />} />
                    <Route path="contact" element={<ContactPage />} />
                    <Route path="hours" element={<HoursPage />} />
                    <Route path="reservations" element={<ReservationPage />} />
                    <Route path="catering" element={<CateringPage />} />
                    <Route path="pre-order" element={<CateringPage />} />
                    <Route path="privacy" element={<PrivacyPage />} />
                    <Route path="order-history" element={<ErrorBoundary inline><OrderHistoryPage /></ErrorBoundary>} />
                    <Route path="rewards" element={<ErrorBoundary inline><RewardsPage /></ErrorBoundary>} />
                    <Route path="gift-cards" element={<ErrorBoundary inline><GiftCardsPage /></ErrorBoundary>} />
                    <Route path="gift-cards/buy" element={<ErrorBoundary inline><BuyGiftCardPage /></ErrorBoundary>} />
                    <Route path="gift-cards/success" element={<ErrorBoundary inline><GiftCardPurchaseSuccessPage /></ErrorBoundary>} />
                    <Route path="gift-cards/v/:token" element={<ErrorBoundary inline><GiftCardViewPage /></ErrorBoundary>} />
                    <Route path="account" element={<ErrorBoundary inline><AccountPage /></ErrorBoundary>} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
            </OrderModeProvider>
            </AuthProvider>
            </ToastProvider>
          </CartProvider>
        </LanguageProvider>
      </SiteSettingsProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
