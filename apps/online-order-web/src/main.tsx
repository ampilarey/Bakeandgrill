import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SiteSettingsProvider } from './context/SiteSettingsContext';
import { LanguageProvider } from './context/LanguageContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/Layout';
import { ScrollToTop } from './components/ScrollToTop';
import './index.css';

// Lazily load all page components for code splitting
const HomePage         = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const MenuPage         = lazy(() => import('./pages/MenuPage').then((m) => ({ default: m.MenuPage })));
const AboutPage        = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const ContactPage      = lazy(() => import('./pages/ContactPage').then((m) => ({ default: m.ContactPage })));
const HoursPage        = lazy(() => import('./pages/HoursPage').then((m) => ({ default: m.HoursPage })));
const ReservationPage  = lazy(() => import('./pages/ReservationPage').then((m) => ({ default: m.ReservationPage })));
const CheckoutPage     = lazy(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const OrderStatusPage  = lazy(() => import('./pages/OrderStatusPage').then((m) => ({ default: m.OrderStatusPage })));
const PreOrderPage     = lazy(() => import('./pages/PreOrderPage').then((m) => ({ default: m.PreOrderPage })));
const PrivacyPage      = lazy(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const NotFoundPage     = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

// Minimal fallback shown while a page chunk loads
function PageSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem 1.5rem', maxWidth: '1300px', margin: '0 auto' }}>
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
            <BrowserRouter basename="/order">
              <ScrollToTop />
              <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  {/* Public pages wrapped in shared Layout */}
                  <Route element={<Layout />}>
                    <Route index element={<HomePage />} />
                    <Route path="menu" element={<MenuPage />} />
                    <Route path="about" element={<AboutPage />} />
                    <Route path="contact" element={<ContactPage />} />
                    <Route path="hours" element={<HoursPage />} />
                    <Route path="reservations" element={<ReservationPage />} />
                    <Route path="pre-order" element={<PreOrderPage />} />
                    <Route path="privacy" element={<PrivacyPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>

                  {/* Standalone pages — no Layout wrapper */}
                  <Route path="checkout" element={<CheckoutPage />} />
                  <Route path="orders/:orderId" element={<OrderStatusPage />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            </ToastProvider>
          </CartProvider>
        </LanguageProvider>
      </SiteSettingsProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
