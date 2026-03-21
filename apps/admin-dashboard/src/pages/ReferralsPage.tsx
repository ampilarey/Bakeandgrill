import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, Badge, Btn, Modal, ModalActions,
  Pagination, EmptyState, Spinner, ErrorMsg,
} from '../components/SharedUI';
import { fetchAdminReferrals, validateReferralCode, type Referral } from '../api';

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange', completed: 'green', expired: 'gray', cancelled: 'red',
};

export default function ReferralsPage() {
  usePageTitle('Referrals');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [page, setPage]           = useState(1);
  const [lastPage, setLastPage]   = useState(1);
  const [total, setTotal]         = useState(0);
  const [statusFilter, setStatus] = useState('');

  const [checkCode, setCheckCode]     = useState('');
  const [checking, setChecking]       = useState(false);
  const [checkResult, setCheckResult] = useState<{ valid: boolean; referrer?: { name: string; phone: string }; message?: string } | null>(null);
  const [showCheck, setShowCheck]     = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchAdminReferrals({ page, status: statusFilter || undefined });
      setReferrals(res.data);
      setLastPage(res.meta.last_page);
      setTotal(res.meta.total);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page, statusFilter]);

  const handleCheck = async () => {
    if (!checkCode.trim()) return;
    setChecking(true); setCheckResult(null);
    try {
      const res = await validateReferralCode(checkCode.trim().toUpperCase());
      setCheckResult(res);
    } catch (e) {
      setCheckResult({ valid: false, message: (e as Error).message });
    } finally { setChecking(false); }
  };

  const selectStyle = {
    height: 36, padding: '0 10px', border: '1.5px solid #E8E0D8', borderRadius: 10,
    fontSize: 13, fontFamily: 'inherit', background: '#fff', outline: 'none', cursor: 'pointer',
  };

  return (
    <>
      <PageHeader
        title="Referral Program"
        subtitle={`${total} referral${total !== 1 ? 's' : ''} total`}
        action={<Btn onClick={() => setShowCheck(true)}>Validate Code</Btn>}
      />
      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? <Spinner /> : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Code', 'Referrer', 'Referred', 'Status', 'Reward', 'Date'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E8E0D8', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {referrals.length === 0 ? (
                <tr><td colSpan={6}><EmptyState>No referrals yet</EmptyState></td></tr>
              ) : referrals.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #F0EBE5' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <code style={{ fontSize: 12, background: '#F8F6F3', padding: '2px 8px', borderRadius: 6, fontWeight: 700, letterSpacing: '0.05em' }}>
                      {r.code}
                    </code>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1C1408' }}>{r.referrer?.name ?? '—'}</div>
                    {r.referrer?.phone && <div style={{ fontSize: 11, color: '#9C8E7E' }}>{r.referrer.phone}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {r.referred ? (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1C1408' }}>{r.referred.name}</div>
                        <div style={{ fontSize: 11, color: '#9C8E7E' }}>{r.referred.phone}</div>
                      </>
                    ) : <span style={{ color: '#9C8E7E', fontSize: 12 }}>Not yet used</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}><Badge color={STATUS_COLOR[r.status] ?? 'gray'}>{r.status}</Badge></td>
                  <td style={{ padding: '12px 16px' }}>
                    {r.reward_amount != null
                      ? <span style={{ fontWeight: 600, color: '#D4813A' }}>MVR {parseFloat(String(r.reward_amount)).toFixed(2)}</span>
                      : <span style={{ color: '#9C8E7E', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#9C8E7E' }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lastPage > 1 && <Pagination page={page} totalPages={lastPage} onChange={setPage} />}
        </TableCard>
      )}

      {/* Validate Code Modal */}
      {showCheck && (
        <Modal title="Validate Referral Code" onClose={() => { setShowCheck(false); setCheckCode(''); setCheckResult(null); }} maxWidth={380}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Referral Code</label>
            <input
              value={checkCode}
              onChange={(e) => setCheckCode(e.target.value.toUpperCase())}
              placeholder="e.g. JOHND123"
              onKeyDown={(e) => e.key === 'Enter' && void handleCheck()}
              style={{
                width: '100%', height: 38, padding: '0 12px', border: '1.5px solid #E8E0D8',
                borderRadius: 10, fontSize: 14, fontFamily: 'monospace', background: '#fff',
                outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase', letterSpacing: '0.08em',
              }}
            />
          </div>

          {checkResult && (
            <div style={{
              padding: '12px 16px', borderRadius: 10, marginBottom: 16,
              background: checkResult.valid ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${checkResult.valid ? '#bbf7d0' : '#fecaca'}`,
            }}>
              <p style={{ fontWeight: 700, color: checkResult.valid ? '#15803d' : '#dc2626', margin: '0 0 4px', fontSize: 14 }}>
                {checkResult.valid ? '✓ Valid Code' : '✗ Invalid Code'}
              </p>
              {checkResult.valid && checkResult.referrer && (
                <p style={{ fontSize: 13, color: '#6B5D4F', margin: 0 }}>
                  Referrer: <strong>{checkResult.referrer.name}</strong> ({checkResult.referrer.phone})
                </p>
              )}
              {checkResult.message && (
                <p style={{ fontSize: 13, color: '#9C8E7E', margin: 0 }}>{checkResult.message}</p>
              )}
            </div>
          )}

          <ModalActions>
            <Btn variant="ghost" onClick={() => { setShowCheck(false); setCheckCode(''); setCheckResult(null); }}>Close</Btn>
            <Btn onClick={() => void handleCheck()} disabled={checking || !checkCode.trim()}>
              {checking ? 'Checking…' : 'Check Code'}
            </Btn>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
