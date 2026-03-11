import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
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
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
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
            </Route>

            {/* Standalone pages — no Layout wrapper */}
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="orders/:orderId" element={<OrderStatusPage />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
