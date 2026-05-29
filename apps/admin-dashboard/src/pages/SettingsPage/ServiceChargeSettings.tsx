import { useEffect, useState } from 'react';
import { Button, Card } from '../../components/ui';
import {
  getServiceChargeSettings,
  updateServiceChargeSettings,
  type ServiceChargeSettings,
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
        borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

export function ServiceChargeSettings() {
  const [form, setForm] = useState<ServiceChargeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getServiceChargeSettings()
      .then((r) => setForm(r.settings))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updateServiceChargeSettings(form);
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

  const exampleSubtotal = 100;
  const exampleSc = form.type === 'percent'
    ? Math.round(exampleSubtotal * Math.min(form.value, 100)) / 100
    : form.value;

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <p style={{ color: '#dc2626', fontSize: 13, margin: 0, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
          {error}
        </p>
      )}

      <p style={{ margin: 0, fontSize: 13, color: '#6B5D4F', lineHeight: 1.5 }}>
        Service charge is calculated by the backend and applied only to eligible orders. Paid orders are never changed when you update these settings.
      </p>

      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Enable service charge</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E' }}>When off, no service charge is added to any order.</p>
          </div>
          <Toggle on={form.enabled} onClick={() => setForm({ ...form, enabled: !form.enabled })} />
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Label</label>
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            maxLength={50}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E8E0D8', fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Charge type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'percent' | 'fixed' })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E8E0D8', fontFamily: 'inherit' }}
            >
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount (MVR)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>
              {form.type === 'percent' ? 'Value (%)' : 'Value (MVR)'}
            </label>
            <input
              type="number"
              min={0}
              max={form.type === 'percent' ? 100 : 500}
              step={form.type === 'percent' ? 0.1 : 1}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E8E0D8', fontFamily: 'inherit' }}
            />
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E' }}>
          Example: {form.type === 'percent' ? `${form.value}% on MVR ${exampleSubtotal} = MVR ${exampleSc.toFixed(2)}` : `Fixed MVR ${form.value} per eligible order`}
        </p>
        </div>
      </Card>

      <Card>
        <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Apply service charge to</p>
        {([
          ['apply_dine_in', 'Dine-in'],
          ['apply_takeaway', 'Takeaway'],
          ['apply_online_pickup', 'Online pickup'],
          ['apply_delivery', 'Delivery'],
        ] as const).map(([key, label]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </Card>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Taxable</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E' }}>Include service charge in GST calculation.</p>
          </div>
          <Toggle on={form.taxable} onClick={() => setForm({ ...form, taxable: !form.taxable })} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Show on receipts</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9C8E7E' }}>Display as a separate line on printed and digital receipts.</p>
          </div>
          <Toggle on={form.show_on_receipts} onClick={() => setForm({ ...form, show_on_receipts: !form.show_on_receipts })} />
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
