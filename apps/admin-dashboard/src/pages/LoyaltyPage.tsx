import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchLoyaltyAccounts, adjustLoyaltyPoints, fetchLoyaltyLedger,
  fetchLoyaltySettings, updateLoyaltySettings, updateLoyaltyTiers,
  type LoyaltyAccountAdmin, type LoyaltySettings, type LoyaltyTierRow,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, Input, Modal, ModalActions,
  PageHeader, Spinner, TableCard, TD, TH,
} from '../components/Layout';
import { Toggle } from '../components/ui';
import { downloadCSV } from '../utils/csvExport';

const TIER_COLOR: Record<string, string> = {
  bronze: 'orange', silver: 'gray', gold: 'yellow', platinum: 'blue',
};

const TAB_STYLE = (active: boolean): React.CSSProperties => ({
  padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
  fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
  background: active ? '#D4813A' : 'transparent',
  color: active ? '#fff' : '#6B5D4F',
});

const FIELD = {
  label: { display: 'block' as const, fontSize: 12, fontWeight: 700, color: '#6B5D4F', marginBottom: 4 },
  hint: { fontSize: 11, color: '#9C8E7E', margin: '4px 0 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 },
};

function toDatetimeLocal(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function LedgerModal({ customerId, name, onClose }: {
  customerId: number; name: string; onClose: () => void;
}) {
  const [entries, setEntries] = useState<Array<{ id: number; delta: number; reason: string; order_id?: number | null; order_number?: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEntries([]);
    setLedgerError('');
    fetchLoyaltyLedger(customerId)
      .then((r) => { if (!cancelled) setEntries(r.data ?? []); })
      .catch((e: Error) => { if (!cancelled) setLedgerError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId]);

  return (
    <Modal title={`Ledger — ${name}`} onClose={onClose} maxWidth={520}>
      {ledgerError && <p style={{ color: '#dc2626', fontSize: 13, padding: 8 }}>{ledgerError}</p>}
      {loading ? <Spinner /> : entries.length === 0 ? (
        <EmptyState message="No transactions yet." />
      ) : (
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {entries.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F0EBE5' }}>
              <div>
                <p style={{ fontSize: 14, color: '#1C1408', margin: 0 }}>{e.reason}</p>
                <p style={{ fontSize: 11, color: '#9C8E7E', margin: '2px 0 0' }}>
                  {new Date(e.created_at).toLocaleString()}
                  {e.order_id ? (
                    <>
                      {' · '}
                      <Link to={`/orders?order=${e.order_id}`} style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}>
                        Order #{e.order_number ?? e.order_id}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              <span style={{ fontWeight: 800, fontSize: 15, color: e.delta >= 0 ? '#22c55e' : '#ef4444' }}>
                {e.delta >= 0 ? '+' : ''}{e.delta} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AdjustModal({ account, onClose, onDone }: {
  account: LoyaltyAccountAdmin; onClose: () => void; onDone: () => void;
}) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const d = parseInt(delta, 10);
    if (isNaN(d) || d === 0 || !reason) { setError('Delta and reason are required.'); return; }
    setError('');
    setLoading(true);
    try {
      await adjustLoyaltyPoints(account.customer_id, d, reason);
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Adjust Points" onClose={onClose} maxWidth={400}>
      <p style={{ color: '#6B5D4F', fontSize: 14, marginBottom: 16 }}>
        {account.customer_name ?? account.customer_phone} — balance: <strong style={{ color: '#D4813A' }}>{account.points_balance} pts</strong>
      </p>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={FIELD.label}>Points (use − to deduct)</label>
          <Input value={delta} onChange={setDelta} placeholder="e.g. 100 or -50" type="number" />
        </div>
        <div>
          <label style={FIELD.label}>Reason</label>
          <Input value={reason} onChange={setReason} placeholder="e.g. Goodwill adjustment" />
        </div>
      </div>
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={loading}>{loading ? 'Saving…' : 'Apply Adjustment'}</Btn>
      </ModalActions>
    </Modal>
  );
}

function ProgramSettingsPanel() {
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchLoyaltySettings();
      setSettings(res.settings);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const patch = (field: keyof LoyaltySettings, value: unknown) => {
    setSettings((s) => s ? { ...s, [field]: value } : s);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const res = await updateLoyaltySettings({
        ...settings,
        program_starts_at: settings.program_starts_at || null,
        program_ends_at: settings.program_ends_at || null,
      });
      setSettings(res.settings);
      setSaved('Settings saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;
  if (!settings) return error ? <ErrorMsg message={error} /> : null;

  return (
    <Card>
      {error && <ErrorMsg message={error} />}
      {saved && <p style={{ color: '#16a34a', fontSize: 13, margin: '0 0 12px' }}>{saved}</p>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontWeight: 700, color: '#1C1408', margin: 0 }}>Loyalty program</p>
          <p style={{ fontSize: 13, color: '#6B5D4F', margin: '4px 0 0' }}>Turn earn/redeem on or off for all channels.</p>
        </div>
        <Toggle checked={settings.enabled} onChange={(v) => patch('enabled', v)} label={settings.enabled ? 'Enabled' : 'Disabled'} />
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: '0 0 12px' }}>Earn rules</h3>
      <div style={{ ...FIELD.grid, marginBottom: 20 }}>
        <div>
          <label style={FIELD.label}>Points per MVR 1 (food)</label>
          <Input value={String(settings.earn_rate_per_mvr)} onChange={(v) => patch('earn_rate_per_mvr', parseFloat(v) || 0)} type="number" />
          <p style={FIELD.hint}>Default: 1 pt per MVR 1 spent on food.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
          <Toggle checked={settings.earn_on_delivery_fee} onChange={(v) => patch('earn_on_delivery_fee', v)} label="Earn on delivery fee" />
        </div>
        <div>
          <label style={FIELD.label}>Points expiry (days)</label>
          <Input value={String(settings.points_expiry_days)} onChange={(v) => patch('points_expiry_days', parseInt(v, 10) || 0)} type="number" />
          <p style={FIELD.hint}>0 = points never expire.</p>
        </div>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: '0 0 12px' }}>Redeem rules</h3>
      <div style={{ ...FIELD.grid, marginBottom: 20 }}>
        <div>
          <label style={FIELD.label}>Points per MVR 1 discount</label>
          <Input value={String(settings.redeem_rate_points_per_mvr)} onChange={(v) => patch('redeem_rate_points_per_mvr', parseInt(v, 10) || 1)} type="number" />
          <p style={FIELD.hint}>100 = 100 pts → MVR 1 off.</p>
        </div>
        <div>
          <label style={FIELD.label}>Minimum redeem (points)</label>
          <Input value={String(settings.min_redeem_points)} onChange={(v) => patch('min_redeem_points', parseInt(v, 10) || 1)} type="number" />
        </div>
        <div>
          <label style={FIELD.label}>Maximum redeem (points)</label>
          <Input value={String(settings.max_redeem_points)} onChange={(v) => patch('max_redeem_points', parseInt(v, 10) || 1)} type="number" />
        </div>
        <div>
          <label style={FIELD.label}>Max % of order subtotal</label>
          <Input value={String(settings.max_redeem_percent)} onChange={(v) => patch('max_redeem_percent', parseFloat(v) || 0)} type="number" />
        </div>
        <div>
          <label style={FIELD.label}>Hold TTL (minutes)</label>
          <Input value={String(settings.hold_ttl_minutes)} onChange={(v) => patch('hold_ttl_minutes', parseInt(v, 10) || 1)} type="number" />
          <p style={FIELD.hint}>How long points stay reserved during checkout.</p>
        </div>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: '0 0 12px' }}>Program window</h3>
      <div style={{ ...FIELD.grid, marginBottom: 20 }}>
        <div>
          <label style={FIELD.label}>Starts (optional)</label>
          <input
            type="datetime-local"
            value={toDatetimeLocal(settings.program_starts_at)}
            onChange={(e) => patch('program_starts_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
            style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }}
          />
        </div>
        <div>
          <label style={FIELD.label}>Ends (optional)</label>
          <input
            type="datetime-local"
            value={toDatetimeLocal(settings.program_ends_at)}
            onChange={(e) => patch('program_ends_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
            style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p style={{ fontWeight: 700, color: '#1C1408', margin: 0 }}>Tier multipliers</p>
            <p style={{ fontSize: 13, color: '#6B5D4F', margin: '4px 0 0' }}>Apply earn multipliers by lifetime tier (configure tiers in the Tiers tab).</p>
          </div>
          <Toggle checked={settings.tiers_enabled} onChange={(v) => patch('tiers_enabled', v)} label={settings.tiers_enabled ? 'On' : 'Off'} />
        </div>
        <label style={FIELD.label}>Customer message (checkout & account)</label>
        <textarea
          value={settings.customer_message}
          onChange={(e) => patch('customer_message', e.target.value)}
          placeholder="Optional note shown to customers about the loyalty program"
          rows={3}
          style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save program settings'}</Btn>
    </Card>
  );
}

function TiersPanel() {
  const [tiers, setTiers] = useState<LoyaltyTierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    fetchLoyaltySettings()
      .then((r) => setTiers(r.tiers ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const patchTier = (id: number, field: keyof LoyaltyTierRow, value: string) => {
    setTiers((rows) => rows.map((t) => {
      if (t.id !== id) return t;
      if (field === 'name' || field === 'slug') return { ...t, [field]: value };
      return { ...t, [field]: field === 'earn_multiplier' ? parseFloat(value) || 0 : parseInt(value, 10) || 0 };
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const res = await updateLoyaltyTiers(tiers);
      setTiers(res.tiers);
      setSaved('Tiers saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <Card>
      {error && <ErrorMsg message={error} />}
      {saved && <p style={{ color: '#16a34a', fontSize: 13, margin: '0 0 12px' }}>{saved}</p>}
      <p style={{ fontSize: 13, color: '#6B5D4F', margin: '0 0 16px' }}>
        Customers are placed in the highest tier whose minimum lifetime points they have reached. Earn multiplier applies when tier multipliers are enabled in Program Settings.
      </p>
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              {['Name', 'Slug', 'Min lifetime pts', 'Earn multiplier', 'Sort'].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.id}>
                <td style={TD}><Input value={t.name} onChange={(v) => patchTier(t.id, 'name', v)} /></td>
                <td style={TD}><Input value={t.slug} onChange={(v) => patchTier(t.id, 'slug', v)} /></td>
                <td style={TD}><Input value={String(t.min_lifetime_points)} onChange={(v) => patchTier(t.id, 'min_lifetime_points', v)} type="number" /></td>
                <td style={TD}><Input value={String(t.earn_multiplier)} onChange={(v) => patchTier(t.id, 'earn_multiplier', v)} type="number" /></td>
                <td style={TD}><Input value={String(t.sort_order)} onChange={(v) => patchTier(t.id, 'sort_order', v)} type="number" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <div style={{ marginTop: 16 }}>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save tiers'}</Btn>
      </div>
    </Card>
  );
}

function AccountsPanel() {
  const [accounts, setAccounts] = useState<LoyaltyAccountAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [adjusting, setAdjusting] = useState<LoyaltyAccountAdmin | null>(null);
  const [viewingLedger, setViewingLedger] = useState<LoyaltyAccountAdmin | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchLoyaltyAccounts({ search: search || undefined });
      setAccounts(res.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <>
      {error && <ErrorMsg message={error} />}
      <div style={{ marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          value={search}
          onChange={setSearch}
          placeholder="Search by name or phone…"
          style={{ maxWidth: 320 }}
        />
        <Btn variant="secondary" onClick={() => downloadCSV('loyalty-accounts', accounts.map((a) => ({
          Name: a.customer_name ?? '', Phone: a.customer_phone, Points: a.points_balance,
          Tier: a.tier, 'Lifetime Points': a.lifetime_points,
        })))}>Export CSV</Btn>
      </div>

      {loading && accounts.length === 0 ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <Card><EmptyState message="No loyalty accounts found." /></Card>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['Customer', 'Phone', 'Tier', 'Balance', 'Held', 'Lifetime', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td style={{ ...TD, fontWeight: 600 }}>
                    <Link to={`/customers?customer=${a.customer_id}`} style={{ color: '#D4813A', textDecoration: 'none' }}>
                      {a.customer_name ?? `Customer #${a.customer_id}`}
                    </Link>
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{a.customer_phone}</td>
                  <td style={TD}><Badge label={a.tier} color={TIER_COLOR[a.tier] ?? 'gray'} /></td>
                  <td style={{ ...TD, fontWeight: 700, color: '#D4813A' }}>{a.points_balance.toLocaleString()} pts</td>
                  <td style={{ ...TD, color: '#9C8E7E' }}>{a.points_held > 0 ? `${a.points_held} held` : '—'}</td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{a.lifetime_points.toLocaleString()}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="ghost" onClick={() => setViewingLedger(a)}>Ledger</Btn>
                      <Btn small variant="secondary" onClick={() => setAdjusting(a)}>Adjust</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {adjusting && (
        <AdjustModal account={adjusting} onClose={() => setAdjusting(null)} onDone={load} />
      )}
      {viewingLedger && (
        <LedgerModal
          customerId={viewingLedger.customer_id}
          name={viewingLedger.customer_name ?? viewingLedger.customer_phone}
          onClose={() => setViewingLedger(null)}
        />
      )}
    </>
  );
}

export function LoyaltyPage() {
  usePageTitle('Loyalty');
  const [tab, setTab] = useState<'accounts' | 'settings' | 'tiers'>('settings');

  return (
    <>
      <PageHeader
        title="Loyalty Program"
        subtitle="Configure earn/redeem rules, tiers, and manage customer balances"
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" style={TAB_STYLE(tab === 'settings')} onClick={() => setTab('settings')}>Program Settings</button>
        <button type="button" style={TAB_STYLE(tab === 'tiers')} onClick={() => setTab('tiers')}>Tiers</button>
        <button type="button" style={TAB_STYLE(tab === 'accounts')} onClick={() => setTab('accounts')}>Customer Accounts</button>
      </div>

      {tab === 'settings' && <ProgramSettingsPanel />}
      {tab === 'tiers' && <TiersPanel />}
      {tab === 'accounts' && <AccountsPanel />}
    </>
  );
}
