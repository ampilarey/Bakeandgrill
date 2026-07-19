import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Modal, ModalActions, Btn, Input, Pagination, EmptyState,
} from '../components/SharedUI';
import {
  fetchDiscountCardBatches,
  fetchDiscountCardBatch,
  issueDiscountCardBatch,
  voidDiscountCard,
  type DiscountCardBatch,
  type DiscountCard,
} from '../api';
import { CreditCard, Copy, Check } from 'lucide-react';
import { PrintCardModal, type PrintCardData } from '../components/PrintCardModal';

const STATUS_COLOR: Record<string, string> = {
  active: 'green',
  redeemed: 'orange',
  expired: 'red',
  voided: 'gray',
};

function formatDiscount(type: string, value: number): string {
  if (type === 'percentage') return `${value}% off`;
  return `MVR ${(value / 100).toFixed(2)} off`;
}

export default function DiscountCardsPage() {
  usePageTitle('Discount Cards');

  const [batches, setBatches] = useState<DiscountCardBatch[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [issueOpen, setIssueOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState('');
  const [name, setName] = useState('Discount card');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('10');
  const [quantity, setQuantity] = useState('1');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [minOrderMvr, setMinOrderMvr] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [note, setNote] = useState('');

  const [issuedCodes, setIssuedCodes] = useState<Array<{ id: number; code: string; name: string; expires_at: string | null }>>([]);
  const [issuedSubtitle, setIssuedSubtitle] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);

  const [detailBatch, setDetailBatch] = useState<DiscountCardBatch | null>(null);
  const [detailCards, setDetailCards] = useState<DiscountCard[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [printCard, setPrintCard] = useState<PrintCardData | null>(null);
  const [actionMsg, setActionMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchDiscountCardBatches(page);
      setBatches(res.data ?? []);
      setMeta({
        current_page: res.meta?.current_page ?? 1,
        last_page: res.meta?.last_page ?? 1,
        total: res.meta?.total ?? 0,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [page]);

  const resetIssue = () => {
    setName('Discount card');
    setType('percentage');
    setDiscountValue('10');
    setQuantity('1');
    setStartsAt('');
    setExpiresAt('');
    setMinOrderMvr('');
    setMaxUses('1');
    setNote('');
    setIssueError('');
  };

  const handleIssue = async () => {
    const qty = parseInt(quantity, 10);
    const rawVal = parseFloat(discountValue);
    if (!name.trim()) {
      setIssueError('Enter a name.');
      return;
    }
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
      setIssueError('Quantity must be 1–50.');
      return;
    }
    if (!Number.isFinite(rawVal) || rawVal <= 0) {
      setIssueError('Enter a valid discount.');
      return;
    }

    const discount_value = type === 'percentage'
      ? Math.round(rawVal)
      : Math.round(rawVal * 100);

    if (type === 'percentage' && (discount_value < 1 || discount_value > 100)) {
      setIssueError('Percentage must be 1–100.');
      return;
    }
    if (type === 'fixed' && discount_value > 500000) {
      setIssueError('Fixed discount cannot exceed MVR 5000.');
      return;
    }

    setIssuing(true);
    setIssueError('');
    try {
      const res = await issueDiscountCardBatch({
        name: name.trim(),
        type,
        discount_value,
        quantity: qty,
        starts_at: startsAt || null,
        expires_at: expiresAt || null,
        min_order_laar: minOrderMvr.trim() ? Math.round(parseFloat(minOrderMvr) * 100) : 0,
        max_uses_per_card: Math.max(1, parseInt(maxUses, 10) || 1),
        note: note.trim() || null,
      });
      setIssuedSubtitle(formatDiscount(type, discount_value));
      setIssuedCodes(res.cards);
      setIssueOpen(false);
      resetIssue();
      void load();
    } catch (e) {
      setIssueError((e as Error).message);
    } finally {
      setIssuing(false);
    }
  };

  const openBatch = async (batch: DiscountCardBatch) => {
    setDetailLoading(true);
    setActionMsg('');
    try {
      const res = await fetchDiscountCardBatch(batch.id);
      setDetailBatch(res.batch);
      setDetailCards(res.cards);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleVoid = async (card: DiscountCard) => {
    if (!window.confirm(`Void card ${card.code}? It can no longer be redeemed.`)) return;
    setActionMsg('');
    try {
      await voidDiscountCard(card.id);
      setActionMsg('Card voided.');
      if (detailBatch) await openBatch(detailBatch);
      void load();
    } catch (e) {
      setActionMsg((e as Error).message);
    }
  };

  const copyCodes = async (codes: string[]) => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      setActionMsg('Could not copy.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Discount Cards"
        subtitle="Owner-only unique codes for % or fixed off. Redeem like a promo at checkout or POS."
        action={(
          <Btn onClick={() => { resetIssue(); setIssueOpen(true); }}>
            <CreditCard size={16} />
            Issue cards
          </Btn>
        )}
      />

      {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Batch', 'Discount', 'Qty', 'Active', 'Uses', 'Expires', ''].map((h) => (
                <th key={h || 'actions'} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7}><EmptyState message="Loading…" /></td></tr>
            )}
            {!loading && batches.length === 0 && (
              <tr><td colSpan={7}><EmptyState message="No discount card batches yet." /></td></tr>
            )}
            {!loading && batches.map((b) => (
              <tr key={b.id}>
                <td style={TD}>
                  <div style={{ fontWeight: 700 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: '#8B7355' }}>#{b.id}</div>
                </td>
                <td style={TD}>{formatDiscount(b.type, b.discount_value)}</td>
                <td style={TD}>{b.quantity}</td>
                <td style={TD}>{b.stats?.active ?? '—'}</td>
                <td style={TD}>{b.stats?.redeemed_uses ?? 0}</td>
                <td style={TD}>{b.expires_at ? new Date(b.expires_at).toLocaleDateString() : '—'}</td>
                <td style={TD}>
                  <Btn variant="ghost" small onClick={() => void openBatch(b)}>View</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={meta.current_page} totalPages={meta.last_page} onChange={setPage} />
      </TableCard>

      {issueOpen && (
        <Modal title="Issue discount cards" onClose={() => setIssueOpen(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Input label="Name" value={name} onChange={setName} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                <span style={label}>Type</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'percentage' | 'fixed')}
                  style={selectStyle}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed MVR</option>
                </select>
              </label>
              <Input
                label={type === 'percentage' ? 'Percent (1–100)' : 'Amount (MVR)'}
                type="number"
                value={discountValue}
                onChange={setDiscountValue}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Input label="Quantity (1–50)" type="number" value={quantity} onChange={setQuantity} />
              <Input label="Uses per card" type="number" value={maxUses} onChange={setMaxUses} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Input label="Valid from (optional)" type="date" value={startsAt} onChange={setStartsAt} />
              <Input label="Expires (optional)" type="date" value={expiresAt} onChange={setExpiresAt} />
            </div>
            <Input label="Min order MVR (optional)" type="number" value={minOrderMvr} onChange={setMinOrderMvr} placeholder="0" />
            <Input label="Note (optional)" value={note} onChange={setNote} placeholder="Staff meal · VIP weekend…" />
            {issueError && <p style={{ margin: 0, color: '#dc2626', fontSize: 13 }}>{issueError}</p>}
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setIssueOpen(false)}>Cancel</Btn>
            <Btn onClick={() => void handleIssue()} disabled={issuing}>{issuing ? 'Issuing…' : 'Issue'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {issuedCodes.length > 0 && (
        <Modal title="Cards issued — save these codes" onClose={() => setIssuedCodes([])} maxWidth={520}>
          <p style={{ fontSize: 13, color: '#8B7355', marginTop: 0 }}>
            Each code works like a promo at online checkout or POS. Print or copy them now.
          </p>
          <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflow: 'auto' }}>
            {issuedCodes.map((c) => (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px', borderRadius: 8, background: '#FEF3E8', fontFamily: 'monospace', fontWeight: 700,
              }}>
                <span>{c.code}</span>
                <Btn
                  variant="ghost"
                  small
                  onClick={() => setPrintCard({
                    type: 'discount_card',
                    code: c.code,
                    title: c.name,
                    subtitle: issuedSubtitle,
                    expiry: c.expires_at,
                    note: 'Valid online & in-store',
                  })}
                >
                  Print
                </Btn>
              </div>
            ))}
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => void copyCodes(issuedCodes.map((c) => c.code))}>
              {copiedAll ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy all</>}
            </Btn>
            <Btn onClick={() => setIssuedCodes([])}>Done</Btn>
          </ModalActions>
        </Modal>
      )}

      {detailBatch && (
        <Modal
          title={detailBatch.name}
          onClose={() => { setDetailBatch(null); setDetailCards([]); }}
          maxWidth={560}
        >
          {detailLoading && <p>Loading…</p>}
          {!detailLoading && (
            <>
              <p style={{ fontSize: 13, color: '#8B7355', marginTop: 0 }}>
                {formatDiscount(detailBatch.type, detailBatch.discount_value)}
                {detailBatch.expires_at ? ` · expires ${new Date(detailBatch.expires_at).toLocaleDateString()}` : ''}
                {detailBatch.min_order_laar > 0 ? ` · min MVR ${(detailBatch.min_order_laar / 100).toFixed(0)}` : ''}
              </p>
              {actionMsg && <p style={{ fontSize: 13 }}>{actionMsg}</p>}
              <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflow: 'auto' }}>
                {detailCards.map((c) => (
                  <div key={c.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    padding: '8px 10px', border: '1px solid #EDE4D4', borderRadius: 8,
                  }}>
                    <div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.code}</div>
                      <div style={{ fontSize: 12, color: '#8B7355' }}>
                        {c.redemptions_count}/{c.max_uses ?? '∞'} uses
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge color={STATUS_COLOR[c.status] ?? 'gray'} label={c.status} />
                      {c.status === 'active' && (
                        <>
                          <Btn
                            variant="ghost"
                            small
                            onClick={() => setPrintCard({
                              type: 'discount_card',
                              code: c.code,
                              title: c.name,
                              subtitle: formatDiscount(c.type, c.discount_value),
                              expiry: c.expires_at,
                              note: 'Valid online & in-store',
                            })}
                          >
                            Print
                          </Btn>
                          <Btn variant="ghost" small onClick={() => void handleVoid(c)}>Void</Btn>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <ModalActions>
            <Btn variant="secondary" onClick={() => void copyCodes(detailCards.map((c) => c.code))}>Copy codes</Btn>
            <Btn onClick={() => { setDetailBatch(null); setDetailCards([]); }}>Close</Btn>
          </ModalActions>
        </Modal>
      )}

      {printCard && (
        <PrintCardModal data={printCard} onClose={() => setPrintCard(null)} />
      )}
    </div>
  );
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: '#8B7355',
  marginBottom: 4,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1.5px solid #EDE4D4',
  fontSize: 14,
  fontFamily: 'inherit',
  minHeight: 44,
};
