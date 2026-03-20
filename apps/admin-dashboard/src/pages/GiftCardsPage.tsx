import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, StatCard, TableCard, TH, TD, Badge, Modal, ModalActions, Btn, Input, Pagination, EmptyState,
} from '../components/SharedUI';
import { fetchGiftCards, issueGiftCard, checkGiftCardBalance, type GiftCard } from '../api';
import { Gift, Search } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  active: 'green', redeemed: 'orange', expired: 'red', cancelled: 'gray',
};

export default function GiftCardsPage() {
  usePageTitle('Gift Cards');

  const [cards, setCards] = useState<GiftCard[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const [issueOpen, setIssueOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState('');
  const [issuedCard, setIssuedCard] = useState<GiftCard | null>(null);

  const [balanceCode, setBalanceCode] = useState('');
  const [balanceResult, setBalanceResult] = useState<{ code: string; current_balance: number; expires_at: string | null } | null>(null);
  const [balanceError, setBalanceError] = useState('');
  const [checkingBalance, setCheckingBalance] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchGiftCards({ page });
      setCards(res.data);
      setMeta(res.meta);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page]);

  const handleIssue = async () => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setIssueError('Enter a valid amount.'); return; }
    setIssuing(true); setIssueError('');
    try {
      const res = await issueGiftCard({ amount: amt, expires_at: expiresAt || null });
      setIssuedCard(res.gift_card);
      setAmount(''); setExpiresAt('');
      void load();
    } catch (e) { setIssueError((e as Error).message); }
    finally { setIssuing(false); }
  };

  const handleCheckBalance = async () => {
    if (!balanceCode.trim()) return;
    setCheckingBalance(true); setBalanceError(''); setBalanceResult(null);
    try {
      const res = await checkGiftCardBalance(balanceCode.trim().toUpperCase());
      setBalanceResult(res);
    } catch (e) { setBalanceError((e as Error).message); }
    finally { setCheckingBalance(false); }
  };

  const activeCards = cards.filter(c => c.status === 'active');
  const totalValue = activeCards.reduce((s, c) => s + c.current_balance, 0);

  return (
    <div>
      <PageHeader
        title="Gift Cards"
        action={<Btn onClick={() => { setIssueOpen(true); setIssuedCard(null); setIssueError(''); }}>+ Issue Gift Card</Btn>}
      />
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Issued" value={String(meta.total)} accent="#D4813A" />
        <StatCard label="Active Cards" value={String(activeCards.length)} accent="#22c55e" />
        <StatCard label="Active Balance" value={`MVR ${totalValue.toFixed(2)}`} accent="#8b5cf6" />
      </div>

      {/* Balance checker */}
      <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <p style={{ fontWeight: 700, color: '#1C1408', margin: '0 0 12px', fontSize: 14 }}>Check Balance</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            placeholder="XXXX-XXXX-XXXX"
            value={balanceCode}
            onChange={e => { setBalanceCode(e.target.value.toUpperCase()); setBalanceResult(null); setBalanceError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleCheckBalance()}
            style={{ fontFamily: 'monospace', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, maxWidth: 220, textTransform: 'uppercase' }}
          />
          <Btn variant="secondary" onClick={handleCheckBalance} disabled={checkingBalance}>
            <Search size={14} style={{ marginRight: 6 }} />{checkingBalance ? 'Checking…' : 'Check'}
          </Btn>
        </div>
        {balanceResult && (
          <div style={{ marginTop: 12, padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
            <p style={{ margin: 0, color: '#166534', fontWeight: 700 }}>Balance: MVR {balanceResult.current_balance.toFixed(2)}</p>
            {balanceResult.expires_at && <p style={{ margin: '4px 0 0', color: '#166534', fontSize: 12 }}>Expires: {balanceResult.expires_at}</p>}
          </div>
        )}
        {balanceError && <p style={{ color: '#ef4444', margin: '8px 0 0', fontSize: 13 }}>{balanceError}</p>}
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Code', 'Issued To', 'Initial', 'Balance', 'Status', 'Expires', 'Issued'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
            ) : cards.length === 0 ? (
              <tr><td colSpan={7}><EmptyState message="No gift cards yet." /></td></tr>
            ) : cards.map(card => (
              <tr key={card.id}>
                <td style={TD}><code style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.05em', color: '#1C1408' }}>{card.code}</code></td>
                <td style={TD}>{card.issued_to?.name ?? <span style={{ color: '#9C8E7E' }}>—</span>}</td>
                <td style={TD}>MVR {card.initial_balance.toFixed(2)}</td>
                <td style={{ ...TD, fontWeight: 700, color: card.current_balance > 0 ? '#166534' : '#9C8E7E' }}>MVR {card.current_balance.toFixed(2)}</td>
                <td style={TD}><Badge color={STATUS_COLOR[card.status] ?? 'gray'}>{card.status}</Badge></td>
                <td style={TD}>{card.expires_at ?? '—'}</td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{card.created_at ? new Date(card.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Pagination page={page} totalPages={meta.last_page} onChange={setPage} />

      {issueOpen && (
        <Modal title="Issue Gift Card" onClose={() => setIssueOpen(false)}>
          {issuedCard ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <Gift size={40} style={{ color: '#D4813A', marginBottom: 16 }} />
              <p style={{ fontWeight: 700, color: '#1C1408', marginBottom: 8 }}>Gift card issued!</p>
              <p style={{ fontFamily: 'monospace', fontSize: 20, letterSpacing: '0.1em', color: '#D4813A', fontWeight: 700, marginBottom: 8 }}>{issuedCard.code}</p>
              <p style={{ color: '#6B5D4F', fontSize: 14 }}>Balance: MVR {issuedCard.current_balance.toFixed(2)}</p>
              {issuedCard.expires_at && <p style={{ color: '#9C8E7E', fontSize: 13 }}>Expires: {issuedCard.expires_at}</p>}
              <div style={{ marginTop: 20 }}>
                <Btn onClick={() => { setIssuedCard(null); setIssueOpen(false); }}>Done</Btn>
              </div>
            </div>
          ) : (
            <>
              {issueError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{issueError}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Amount (MVR) *</span>
                  <Input type="number" min="1" step="0.01" placeholder="50.00" value={amount} onChange={setAmount} />
                </label>
                <label>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Expiry date (optional)</span>
                  <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }} />
                </label>
              </div>
              <ModalActions>
                <Btn variant="secondary" onClick={() => setIssueOpen(false)}>Cancel</Btn>
                <Btn onClick={handleIssue} disabled={issuing}>{issuing ? 'Issuing…' : 'Issue Gift Card'}</Btn>
              </ModalActions>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
