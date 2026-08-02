import { useEffect, useState } from 'react';
import { Button, Card } from '../../components/ui';
import {
  getPaymentCommissionSettings,
  updatePaymentCommissionSettings,
  type PaymentCommissionSettings as Settings,
} from '../../api';

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none',
        cursor: disabled ? 'wait' : 'pointer', background: on ? '#16A34A' : '#D1D5DB',
        position: 'relative', transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18,
        borderRadius: '50%', background: 'var(--color-surface)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function exampleNet(amount: number, ratePercent: number): { fee: number; net: number } {
  const fee = Math.floor(amount * 100 * (ratePercent * 100) / 10000) / 100;
  return { fee, net: Math.round((amount - fee) * 100) / 100 };
}

export function PaymentCommissionSettings() {
  const [form, setForm] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPaymentCommissionSettings()
      .then((r) => setForm(r.settings))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updatePaymentCommissionSettings({
        enabled: form.enabled,
        pos_card_rate_bp: Math.round(form.pos_card_rate_percent * 100),
        online_gateway_rate_bp: Math.round(form.online_gateway_rate_percent * 100),
      });
      setForm(res.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return <p style={{ color: '#9C8E7E', fontSize: 14 }}>Loading…</p>;
  }

  const posExample = exampleNet(100, form.pos_card_rate_percent);
  const gwExample = exampleNet(100, form.online_gateway_rate_percent);

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <p style={{ color: '#dc2626', fontSize: 13, margin: 0, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
          {error}
        </p>
      )}

      <p style={{ margin: 0, fontSize: 13, color: '#6B5D4F', lineHeight: 1.5 }}>
        BML deducts a processing fee from card, QR, and online gateway income. These rates are snapshotted on each payment at settlement time — changing them does not rewrite history. Refunds do not automatically reverse commission (BML typically keeps the fee).
      </p>

      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Track payment commission</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E' }}>When off, no commission is calculated on new payments.</p>
          </div>
          <Toggle on={form.enabled} onClick={() => setForm({ ...form, enabled: !form.enabled })} />
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>POS card / QR rate (%)</label>
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={form.pos_card_rate_percent}
              onChange={(e) => setForm({ ...form, pos_card_rate_percent: parseFloat(e.target.value) || 0 })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E8E0D8', fontFamily: 'inherit' }}
            />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9C8E7E' }}>
              Example: MVR 100 POS card/QR → MVR {posExample.fee.toFixed(2)} fee → MVR {posExample.net.toFixed(2)} net
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Online / BML gateway rate (%)</label>
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={form.online_gateway_rate_percent}
              onChange={(e) => setForm({ ...form, online_gateway_rate_percent: parseFloat(e.target.value) || 0 })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E8E0D8', fontFamily: 'inherit' }}
            />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9C8E7E' }}>
              Example: MVR 100 online pay → MVR {gwExample.fee.toFixed(2)} fee → MVR {gwExample.net.toFixed(2)} net
            </p>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button onClick={() => void handleSave()} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
        {saved && <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 600 }}>Saved</span>}
      </div>
    </div>
  );
}
