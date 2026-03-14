import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LanguageProvider } from './context/LanguageContext';
import { CartProvider } from './context/CartContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { HoursPage } from './pages/HoursPage';
import { ReservationPage } from './pages/ReservationPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderStatusPage } from './pages/OrderStatusPage';
import { PreOrderPage } from './pages/PreOrderPage';
import { PrivacyPage } from './pages/PrivacyPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
    <LanguageProvider>
      <CartProvider>
        <BrowserRouter basename="/order">
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
              <Route path="*" element={
                <div style={{ textAlign: 'center', padding: '4rem 1.5rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1c1e21', marginBottom: '0.5rem' }}>Page not found</h1>
                  <p style={{ color: '#636e72', marginBottom: '1.5rem' }}>The page you're looking for doesn't exist.</p>
                  <a href="/order/" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>Back to home</a>
                </div>
              } />
            </Route>

            {/* Standalone pages — no Layout wrapper */}
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="orders/:orderId" element={<OrderStatusPage />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
