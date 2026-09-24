import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Card, Toggle } from '../../components/ui';
import { getSiteSettings, updateSiteSettings } from '../../api';

/**
 * Refund audit, 2026-09-25. Two switches that had no home:
 *  - whether a card sale at the till must carry the slip / approval
 *    reference, so it can be matched at settlement and refunded against
 *    the right transaction;
 *  - the deposit payout amount above which only an owner may pay a
 *    customer's wallet balance out (payouts skip the refund flow's second
 *    approver and OTP).
 */

const FIELD: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--color-border)', fontSize: 14,
  background: 'var(--color-surface)', color: 'var(--color-text)',
  boxSizing: 'border-box',
};

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--color-text-secondary)', marginBottom: 6,
};

const HINT: React.CSSProperties = {
  margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5,
};

export function RefundPayoutSettings() {
  const [cardRef, setCardRef] = useState(false);
  const [threshold, setThreshold] = useState('500');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSiteSettings()
      .then((res) => {
        const map: Record<string, string> = {};
        Object.values(res.settings ?? {}).forEach((group) => {
          (group as { key: string; value: string | null }[]).forEach((s) => {
            if (s.value !== null) map[s.key] = s.value;
          });
        });
        setCardRef(['1', 'true', 'on', 'yes'].includes(String(map.pos_card_reference_required ?? '0').toLowerCase()));
        setThreshold(map.deposit_payout_owner_threshold_mvr ?? '500');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const n = Number(threshold);
    if (!Number.isFinite(n) || n < 0) {
      setError('The payout threshold must be a number, zero or more. Zero means every payout needs an owner.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateSiteSettings({
        pos_card_reference_required: cardRef ? '1' : '0',
        deposit_payout_owner_threshold_mvr: String(n),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading…</p>;
  }

  return (
    <Card>
      <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Refunds & payouts</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Toggle checked={cardRef} onChange={setCardRef} />
          <div>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Card payments need a slip reference</span>
            <p style={HINT}>With this on, the till refuses a card payment with no approval or slip number, so every card sale can be matched to the terminal at settlement and refunded against the right transaction.</p>
          </div>
        </div>
        <div>
          <label style={LABEL} htmlFor="deposit-payout-threshold">Deposit payouts above this need an owner (MVR)</label>
          <input id="deposit-payout-threshold" data-testid="deposit-payout-threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" style={FIELD} />
          <p style={HINT}>Paying a customer's wallet balance out has no second approver or customer code, unlike an order refund. Managers can pay out up to this amount; above it an owner records the payout. Every payout texts the owners, and yesterday's payouts are in the daily refund summary.</p>
        </div>
        {error && <p style={{ margin: 0, color: 'var(--color-danger)', fontSize: 13 }}>{error}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button onClick={() => void save()} disabled={saving} icon={<Save size={14} />}>{saving ? 'Saving…' : 'Save'}</Button>
          {saved && <span style={{ fontSize: 13, color: 'var(--color-success)' }}>Saved.</span>}
        </div>
      </div>
    </Card>
  );
}
