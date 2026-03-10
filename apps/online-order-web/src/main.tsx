import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import App from './App';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderStatusPage } from './pages/OrderStatusPage';
import { ReservationPage } from './pages/ReservationPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
    <BrowserRouter basename="/order">
      <Routes>
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders/:orderId" element={<OrderStatusPage />} />
        <Route path="/reservations" element={<ReservationPage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
);
