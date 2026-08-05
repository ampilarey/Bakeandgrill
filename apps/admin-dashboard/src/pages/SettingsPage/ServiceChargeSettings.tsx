import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import {
  getServiceChargeSettings,
  updateServiceChargeSettings,
  type ServiceChargeSettings,
} from '../../api';
import { MasterSwitchRow, S } from '../OnlineOrderingPage/orderingControlUi';

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      role="switch"
      aria-checked={on}
      style={{
        flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none',
        cursor: disabled ? 'wait' : 'pointer', background: on ? 'var(--color-success-strong)' : '#D1D5DB',
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

export function ServiceChargeSettings({ embedded = false }: { embedded?: boolean }) {
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
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading…</p>;
  }

  const exampleSubtotal = 100;
  const exampleSc = form.type === 'percent'
    ? Math.round(exampleSubtotal * Math.min(form.value, 100)) / 100
    : form.value;

  const saveButton = embedded ? (
    <div style={{ marginTop: 4 }}>
      <button type="button" className="oc-btn-block" style={S.btnPrimary} onClick={() => void handleSave()} disabled={saving}>
        <Save size={14} />
        {saving ? 'Saving…' : 'Save service charge'}
      </button>
      {saved && <p style={{ ...S.reasonNote, color: 'var(--color-success-strong)', fontWeight: 600 }}>Saved</p>}
    </div>
  ) : (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button onClick={() => void handleSave()} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
      {saved && <span style={{ fontSize: 13, color: 'var(--color-success-strong)', fontWeight: 600 }}>Saved</span>}
    </div>
  );

  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, margin: 0, background: 'var(--color-danger-bg)', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Service charge is calculated by the backend and applied only to eligible orders. Paid orders are never changed when you update these settings.
        </p>

        <MasterSwitchRow
          on={form.enabled}
          toggling={false}
          titleOn="Service charge is ON"
          titleOff="Service charge is OFF"
          helpOn="Added to eligible orders."
          helpOff="No service charge is added to any order."
          onToggle={() => setForm({ ...form, enabled: !form.enabled })}
        />

        <div className="oc-form-grid">
          <div>
            <label style={S.label}>Label</label>
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              maxLength={50}
              style={S.input}
            />
          </div>
          <div>
            <label style={S.label}>Charge type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'percent' | 'fixed' })}
              style={S.input}
            >
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount (MVR)</option>
            </select>
          </div>
          <div>
            <label style={S.label}>{form.type === 'percent' ? 'Value (%)' : 'Value (MVR)'}</label>
            <input
              type="number"
              min={0}
              max={form.type === 'percent' ? 100 : 500}
              step={form.type === 'percent' ? 0.1 : 1}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
              style={S.input}
            />
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
          Example: {form.type === 'percent' ? `${form.value}% on MVR ${exampleSubtotal} = MVR ${exampleSc.toFixed(2)}` : `Fixed MVR ${form.value} per eligible order`}
        </p>

        <div>
          <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>Apply to</p>
          <div className="oc-form-grid">
            {([
              ['apply_dine_in', 'Dine-in'],
              ['apply_takeaway', 'Takeaway'],
              ['apply_online_pickup', 'Online pickup'],
              ['apply_delivery', 'Delivery'],
            ] as const).map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <MasterSwitchRow
          on={form.taxable}
          toggling={false}
          titleOn="Taxable"
          titleOff="Not taxable"
          helpOn="Included in GST calculation."
          helpOff="Excluded from GST calculation."
          onToggle={() => setForm({ ...form, taxable: !form.taxable })}
        />
        <MasterSwitchRow
          on={form.show_on_receipts}
          toggling={false}
          titleOn="Shown on receipts"
          titleOff="Hidden on receipts"
          helpOn="Separate line on printed and digital receipts."
          helpOff="Not shown as a separate receipt line."
          onToggle={() => setForm({ ...form, show_on_receipts: !form.show_on_receipts })}
        />

        {saveButton}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, margin: 0, background: 'var(--color-danger-bg)', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
          {error}
        </p>
      )}

      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        Service charge is calculated by the backend and applied only to eligible orders. Paid orders are never changed when you update these settings.
      </p>

      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>Enable service charge</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>When off, no service charge is added to any order.</p>
          </div>
          <Toggle on={form.enabled} onClick={() => setForm({ ...form, enabled: !form.enabled })} />
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Label</label>
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            maxLength={50}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-border)', fontFamily: 'inherit' }}
          />
        </div>
        <div data-responsive-grid style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Charge type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'percent' | 'fixed' })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-border)', fontFamily: 'inherit' }}
            >
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount (MVR)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              {form.type === 'percent' ? 'Value (%)' : 'Value (MVR)'}
            </label>
            <input
              type="number"
              min={0}
              max={form.type === 'percent' ? 100 : 500}
              step={form.type === 'percent' ? 0.1 : 1}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-border)', fontFamily: 'inherit' }}
            />
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
          Example: {form.type === 'percent' ? `${form.value}% on MVR ${exampleSubtotal} = MVR ${exampleSc.toFixed(2)}` : `Fixed MVR ${form.value} per eligible order`}
        </p>
        </div>
      </Card>

      <Card>
        <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>Apply service charge to</p>
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
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>Include service charge in GST calculation.</p>
          </div>
          <Toggle on={form.taxable} onClick={() => setForm({ ...form, taxable: !form.taxable })} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Show on receipts</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>Display as a separate line on printed and digital receipts.</p>
          </div>
          <Toggle on={form.show_on_receipts} onClick={() => setForm({ ...form, show_on_receipts: !form.show_on_receipts })} />
        </div>
        </div>
      </Card>

      {saveButton}
    </div>
  );
}
