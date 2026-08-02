import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, PageShell, TableCard, Badge, Btn, Modal, ModalActions,
  Pagination, EmptyState, Spinner, ErrorMsg,
} from '../components/SharedUI';
import { fetchAdminReferrals, setReferralCodeActive, validateReferralCode, type ReferralCode } from '../api';

// Rows are referral *codes* (one per customer), not redemption events.
// Active/inactive can be toggled; Validate-Code uses the public endpoint.

const mvr = (n: number | null | undefined) =>
  n == null ? '—' : `MVR ${Number(n).toFixed(2)}`;

export default function ReferralsPage() {
  usePageTitle('Referrals');
  const [codes, setCodes]       = useState<ReferralCode[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [page, setPage]         = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal]       = useState(0);

  const [checkCode, setCheckCode]     = useState('');
  const [checking, setChecking]       = useState(false);
  const [checkResult, setCheckResult] = useState<{ valid: boolean; referee_discount_mvr?: number; message?: string } | null>(null);
  const [showCheck, setShowCheck]     = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchAdminReferrals({ page });
      setCodes(res.data ?? []);
      setLastPage(res.meta?.last_page ?? 1);
      setTotal(res.meta?.total ?? 0);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page]);

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

  const totalUses = codes.reduce((s, c) => s + c.uses_count, 0);

  return (
    <PageShell>
    <>
      <PageHeader section="Customers & Marketing"
        title="Referral Codes"
        subtitle={`${total} code${total !== 1 ? 's' : ''} · ${totalUses} total use${totalUses !== 1 ? 's' : ''} on this page`}
        action={<Btn onClick={() => setShowCheck(true)}>Validate Code</Btn>}
      />
      {error && <ErrorMsg message={error} />}

      {loading ? <Spinner /> : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Code', 'Owner', 'Uses', 'Referrer Reward', 'Referee Discount', 'Status'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 ? (
                <tr><td colSpan={6}><EmptyState>No referral codes generated yet</EmptyState></td></tr>
              ) : codes.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <code style={{ fontSize: 12, background: 'var(--color-bg)', padding: '2px 8px', borderRadius: 6, fontWeight: 700, letterSpacing: '0.05em' }}>
                      {c.code}
                    </code>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {c.customer ? (
                      <Link to={`/customers?customer=${c.customer.id}`} style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>
                        {c.customer.name}
                      </Link>
                    ) : <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text)' }}>
                    <strong>{c.uses_count}</strong>
                    {c.max_uses ? <span style={{ color: 'var(--color-text-muted)' }}> / {c.max_uses}</span> : null}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-primary)' }}>{mvr(c.referrer_reward_mvr)}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#16a34a' }}>{mvr(c.referee_discount_mvr)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge color={c.is_active ? 'green' : 'gray'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>
                      <Btn
                        small
                        variant="secondary"
                        onClick={() => {
                          void setReferralCodeActive(c.id, !c.is_active)
                            .then((res) => {
                              setCodes((list) => list.map((row) => (row.id === c.id ? { ...row, is_active: res.code.is_active } : row)));
                            })
                            .catch((e) => setError((e as Error).message));
                        }}
                      >
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </Btn>
                    </div>
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
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>Referral Code</label>
            <input
              value={checkCode}
              onChange={(e) => setCheckCode(e.target.value.toUpperCase())}
              placeholder="e.g. JOHND123"
              onKeyDown={(e) => e.key === 'Enter' && void handleCheck()}
              style={{
                width: '100%', height: 38, padding: '0 12px', border: '1.5px solid var(--color-border)',
                borderRadius: 10, fontSize: 14, fontFamily: 'monospace', background: 'var(--color-surface)',
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
              {checkResult.valid && checkResult.referee_discount_mvr != null && (
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
                  Friend gets <strong>{mvr(checkResult.referee_discount_mvr)}</strong> off their first order.
                </p>
              )}
              {checkResult.message && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>{checkResult.message}</p>
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

    </PageShell>
  );
}
