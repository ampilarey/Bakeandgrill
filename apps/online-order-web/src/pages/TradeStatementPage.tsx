import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  fetchTradeStatement,
  openTradeInvoicePdf,
  payTradeInvoice,
  type TradeStatement,
} from '../api/trade';
import { PageHeader } from '../components/shell/PageHeader';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

function mvr(n: number): string {
  return `MVR ${Number(n).toFixed(2)}`;
}

function newKey(): string {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function TradeStatementPage() {
  usePageTitle('Statement');
  const navigate = useNavigate();
  const { isAuthenticated, authReady } = useAuth();
  const [statement, setStatement] = useState<TradeStatement | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [partAmounts, setPartAmounts] = useState<Record<number, string>>({});

  const reload = () => {
    setLoading(true);
    fetchTradeStatement()
      .then((res) => setStatement(res.statement))
      .catch((e: Error) => setError(e.message || 'Could not load statement.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    reload();
  }, [authReady, isAuthenticated]);

  const pay = async (invoiceId: number, fullOutstanding: number) => {
    setPayingId(invoiceId);
    setError('');
    try {
      const raw = partAmounts[invoiceId];
      const payload: { idempotency_key: string; amount_mvr?: number } = {
        idempotency_key: newKey(),
      };
      if (raw != null && raw !== '') {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error('Enter a valid amount to pay.');
        }
        if (n > fullOutstanding) {
          throw new Error('That is more than the outstanding amount.');
        }
        payload.amount_mvr = n;
      }
      const res = await payTradeInvoice(invoiceId, payload);
      if (!res.payment_url) {
        throw new Error('Payment link was empty. Please try again.');
      }
      window.location.href = res.payment_url;
    } catch (e) {
      setError((e as Error).message || 'Could not start payment.');
      setPayingId(null);
    }
  };

  if (authReady && !isAuthenticated) {
    return (
      <div style={S.page}>
        <PageHeader title="Statement" onBack={() => navigate('/account')} />
        <div style={S.container}>
          <p style={S.muted}>Sign in to see what your shop owes.</p>
          <Link to="/account" style={S.btnPrimary}>Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page} data-testid="trade-statement-page">
      <PageHeader title="Statement" onBack={() => navigate('/account')} />
      <div style={S.container}>
        <div style={S.navRow}>
          <Link to="/account/deliveries" style={S.navLink}>Deliveries</Link>
          <span style={S.navActive}>Statement</span>
        </div>

        {loading && <p style={S.muted}>Loading…</p>}
        {error && <p style={S.error} role="alert">{error}</p>}

        {statement && !loading && (
          <>
            <div style={S.hero} data-testid="statement-balance">
              <div style={S.heroLabel}>You owe</div>
              <div style={S.heroAmount}>{mvr(statement.balance_owed_mvr)}</div>
              {statement.overdue_mvr > 0 && (
                <div style={S.overdue}>
                  Overdue: {mvr(statement.overdue_mvr)}
                </div>
              )}
            </div>

            <h2 style={S.h2}>Invoices</h2>
            {statement.invoices.length === 0 && (
              <p style={S.muted}>No invoices yet.</p>
            )}
            {statement.invoices.map((inv) => (
              <div key={inv.id} style={S.card} data-testid={`trade-invoice-${inv.id}`}>
                <div style={S.rowTop}>
                  <strong>{inv.invoice_number}</strong>
                  <span style={inv.is_overdue ? S.badgeWarn : S.badge}>{inv.status}</span>
                </div>
                <div style={S.muted}>
                  Issued {inv.issue_date ?? '—'}
                  {inv.due_date ? ` · Due ${inv.due_date}` : ''}
                </div>
                <div style={{ fontSize: 14, marginTop: 6 }}>
                  Total {mvr(inv.total_mvr)}
                  {inv.amount_paid_mvr > 0 ? ` · Paid ${mvr(inv.amount_paid_mvr)}` : ''}
                  {inv.outstanding_mvr > 0 ? ` · Left ${mvr(inv.outstanding_mvr)}` : ''}
                </div>
                <div style={S.actions}>
                  <button
                    type="button"
                    style={S.btnGhost}
                    onClick={() => openTradeInvoicePdf(inv.id).catch((e: Error) => setError(e.message))}
                  >
                    Download PDF
                  </button>
                  {inv.can_pay && (
                    <>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step={0.01}
                        placeholder={`Pay all ${inv.outstanding_mvr.toFixed(2)}`}
                        value={partAmounts[inv.id] ?? ''}
                        onChange={(e) => setPartAmounts((p) => ({ ...p, [inv.id]: e.target.value }))}
                        style={S.amountInput}
                        aria-label={`Amount to pay for ${inv.invoice_number}`}
                      />
                      <button
                        type="button"
                        style={S.btnPrimary}
                        disabled={payingId === inv.id}
                        onClick={() => pay(inv.id, inv.outstanding_mvr)}
                        data-testid={`pay-invoice-${inv.id}`}
                      >
                        {payingId === inv.id ? 'Starting…' : 'Pay'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {statement.payments.length > 0 && (
              <>
                <h2 style={S.h2}>Payments received</h2>
                {statement.payments.map((p) => (
                  <div key={p.id} style={S.card}>
                    <div style={{ fontWeight: 700 }}>{mvr(p.amount_mvr)}</div>
                    <div style={S.muted}>{p.method} · {p.paid_at ? new Date(p.paid_at).toLocaleString() : '—'}</div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { padding: '0 var(--page-gutter) 3rem' },
  container: { maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 },
  muted: { color: 'var(--color-text-muted)', fontSize: 13, margin: 0 },
  error: { color: 'var(--color-error, #dc2626)', fontSize: 14, margin: 0 },
  navRow: { display: 'flex', gap: 12, marginBottom: 4, fontSize: 14 },
  navLink: { color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' },
  navActive: { fontWeight: 800, minHeight: 44, display: 'inline-flex', alignItems: 'center' },
  hero: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 14,
    padding: '18px 16px',
  },
  heroLabel: { fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 600 },
  heroAmount: { fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 4 },
  overdue: { marginTop: 8, color: 'var(--color-error, #dc2626)', fontWeight: 700, fontSize: 14 },
  h2: { fontSize: 15, fontWeight: 800, margin: '8px 0 0' },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    padding: '14px 16px',
  },
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  badge: {
    fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)',
    background: 'var(--color-bg)', padding: '4px 10px', borderRadius: 999,
  },
  badgeWarn: {
    fontSize: 12, fontWeight: 700, color: '#fff',
    background: 'var(--color-error, #dc2626)', padding: '4px 10px', borderRadius: 999,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  amountInput: {
    minHeight: 44,
    flex: '1 1 120px',
    minWidth: 0,
    borderRadius: 12,
    border: '1px solid var(--color-border)',
    padding: '8px 12px',
    fontSize: 16,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  btnPrimary: {
    minHeight: 44,
    border: 'none',
    borderRadius: 12,
    background: 'var(--color-primary)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    fontFamily: 'inherit',
    cursor: 'pointer',
    padding: '0 16px',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    minHeight: 44,
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    background: 'transparent',
    fontWeight: 600,
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: 'pointer',
    padding: '0 14px',
  },
};

export default TradeStatementPage;
