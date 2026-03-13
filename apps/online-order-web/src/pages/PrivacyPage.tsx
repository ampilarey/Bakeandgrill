import { useEffect } from 'react';

export function PrivacyPage() {
  useEffect(() => { document.title = 'Privacy Policy — Bake & Grill'; }, []);

  return (
    <div style={S.wrap}>
      <h1 style={S.h1}>Privacy Policy</h1>
      <p style={S.updated}><em>Last updated: {new Date().toLocaleDateString('en-MV', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>

      <Section title="Introduction">
        <p>Bake &amp; Grill ("we", "us", "our") operates the Bake &amp; Grill café and online ordering system. This Privacy Policy explains how we collect, use, and protect your personal information when you use our services.</p>
      </Section>

      <Section title="Information We Collect">
        <p>When you place an order or use our services, we may collect:</p>
        <ul>
          <li><strong>Phone Number:</strong> Required for OTP authentication and order notifications.</li>
          <li><strong>Name:</strong> Optional, used for personalised service and order receipts.</li>
          <li><strong>Email:</strong> Optional, for e-receipts and order updates.</li>
          <li><strong>Order History:</strong> To provide loyalty rewards and improve service.</li>
          <li><strong>Delivery Address:</strong> Only when you choose delivery — used solely to fulfil your order.</li>
        </ul>
        <p>We do <strong>not</strong> collect, store, or process your payment card details. All card payments are handled exclusively by Bank of Maldives (BML) on their secure payment page.</p>
      </Section>

      <Section title="How We Use Your Information">
        <p>We use your information to:</p>
        <ul>
          <li>Process and fulfil your orders</li>
          <li>Send OTP codes for secure verification</li>
          <li>Send order confirmations and status updates via SMS or email</li>
          <li>Provide customer support</li>
          <li>Send promotional offers (only with your consent — you may opt out at any time)</li>
          <li>Improve our menu and services</li>
        </ul>
      </Section>

      <Section title="SMS Communications">
        <p>By providing your phone number, you consent to receive:</p>
        <ul>
          <li>One-time passcodes (OTP) for order verification</li>
          <li>Order confirmation and status messages</li>
          <li>Promotional offers (if opted in)</li>
        </ul>
        <p><strong>Opt-out:</strong> To stop receiving promotional SMS, reply STOP to any promotional message or contact us at <a href="tel:+9609120011" style={{ color: 'var(--color-primary, #d97706)' }}>+960 912 0011</a>.</p>
      </Section>

      <Section title="Card Payment Security">
        <p>All card payments are processed exclusively through the <strong>Bank of Maldives (BML) BankConnect</strong> secure payment page using SSL/TLS encryption. Bake &amp; Grill does <strong>not</strong> store, view, process, or retain any payment card details on our servers. Your card data is handled entirely by BML.</p>
        <p>We strongly recommend you retain a copy of your order confirmation and payment receipt for your records.</p>
      </Section>

      <Section title="Data Security">
        <p>We implement industry-standard measures to protect your personal data, including:</p>
        <ul>
          <li>Encrypted data transmission (HTTPS/TLS)</li>
          <li>Secure OTP hashing — codes are never stored in plain text</li>
          <li>Role-based access controls for staff</li>
          <li>Regular security reviews to prevent unauthorised access</li>
        </ul>
      </Section>

      <Section title="Data Sharing">
        <p>We do not sell your personal information. We share it only where necessary:</p>
        <ul>
          <li><strong>Dhiraagu (SMS provider):</strong> Your phone number is used solely for message delivery.</li>
          <li><strong>Bank of Maldives (BML):</strong> Order amount and reference for payment processing.</li>
          <li><strong>Legal requirement:</strong> If required by Maldivian law or a competent authority.</li>
        </ul>
      </Section>

      <Section title="Your Rights">
        <p>You have the right to:</p>
        <ul>
          <li>Access your personal data we hold</li>
          <li>Request correction or deletion of your data</li>
          <li>Opt out of promotional communications at any time</li>
          <li>Withdraw consent where processing is based on consent</li>
        </ul>
        <p>To exercise any of these rights, contact us using the details below.</p>
      </Section>

      <Section title="Contact Us">
        <p>For privacy-related questions or requests:</p>
        <ul>
          <li><strong>Email:</strong> <a href="mailto:hello@bakeandgrill.mv" style={{ color: 'var(--color-primary, #d97706)' }}>hello@bakeandgrill.mv</a></li>
          <li><strong>Phone:</strong> <a href="tel:+9609120011" style={{ color: 'var(--color-primary, #d97706)' }}>+960 912 0011</a></li>
          <li><strong>Address:</strong> Kalaafaanu Hingun, Malé 20026, Republic of Maldives</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={S.h2}>{title}</h2>
      <div style={S.body}>{children}</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: '860px', margin: '3rem auto 5rem', padding: '0 1.5rem', fontFamily: 'inherit' },
  h1: { fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 800, color: 'var(--color-dark, #1c1408)', marginBottom: '0.375rem', letterSpacing: '-0.03em' },
  updated: { color: 'var(--color-text-muted, #78716c)', fontSize: '0.9rem', marginBottom: '2.5rem', display: 'block' },
  h2: { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary, #d97706)', marginBottom: '0.75rem' },
  body: { fontSize: '0.95rem', lineHeight: 1.8, color: '#44403c' },
};
