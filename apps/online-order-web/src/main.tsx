import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderStatusPage } from './pages/OrderStatusPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/order">
      <Routes>
        <Route path="/*" element={<App />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders/:orderId" element={<OrderStatusPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
