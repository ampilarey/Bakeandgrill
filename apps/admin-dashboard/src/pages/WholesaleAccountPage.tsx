import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, PageShell, TableCard, Badge, Btn, Modal, ModalActions,
  EmptyState, Spinner, ErrorMsg, Input,
} from '../components/SharedUI';
import {
  createTradePrice,
  deactivateTradeAccount,
  deleteTradePrice,
  fetchAdminItems,
  fetchResolvedTradePrices,
  fetchTradeAccount,
  fetchTradePrices,
  updateTradeAccount,
  type MenuItem,
  type ResolvedTradePriceRow,
  type TradeAccount,
  type TradeBillingCycle,
  type TradeMissingPolicy,
  type TradePriceSource,
  type TradeSettlementMode,
} from '../api';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

const SETTLEMENT_OPTIONS: { value: TradeSettlementMode; label: string; help: string }[] = [
  {
    value: 'sale_or_return',
    label: 'Sale or return (they pay only for what they sell)',
    help: 'Unsold goods can come back. This is the usual consignment deal.',
  },
  {
    value: 'firm_sale',
    label: 'Firm sale (they pay for everything we send)',
    help: 'Once dispatched, the shop owns the goods.',
  },
];

const BILLING_OPTIONS: { value: TradeBillingCycle; label: string }[] = [
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every two weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'per_delivery', label: 'Each delivery' },
];

const MISSING_OPTIONS: { value: TradeMissingPolicy; label: string }[] = [
  { value: 'charge', label: 'Charge them' },
  { value: 'write_off', label: 'Our loss' },
  { value: 'dispute', label: 'Ask me each time' },
];

const WEEKDAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;

const WEEKDAY_LABEL: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

const SOURCE_LABEL: Record<TradePriceSource, string> = {
  account_list: 'shop price',
  item_wholesale: 'standard wholesale',
  retail_discount: 'from retail',
  none: 'no price',
};

function formatMvrFromLaar(laar: number | null | undefined): string {
  if (laar == null) return '—';
  return `MVR ${(laar / 100).toFixed(2)}`;
}

export default function WholesaleAccountPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = Number(id);
  const navigate = useNavigate();
  const { can } = useCurrentUserPermissions();
  const canManageAccounts = can('trade.manage_accounts');
  const canManagePrices = can('trade.manage_prices');

  const [account, setAccount] = useState<TradeAccount | null>(null);
  const [resolved, setResolved] = useState<ResolvedTradePriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [priceOpen, setPriceOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<MenuItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [priceMvr, setPriceMvr] = useState('');
  const [priceError, setPriceError] = useState('');
  const [priceSaving, setPriceSaving] = useState(false);

  usePageTitle(account?.shop_name ?? 'Trade account');

  const load = async () => {
    if (!accountId) return;
    setLoading(true);
    setError('');
    try {
      const [acct, prices] = await Promise.all([
        fetchTradeAccount(accountId),
        fetchResolvedTradePrices(accountId),
      ]);
      setAccount(acct.trade_account);
      setResolved(prices.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accountId]);

  useEffect(() => {
    if (!itemSearch.trim()) {
      setItemResults([]);
      return;
    }
    const t = setTimeout(() => {
      void fetchAdminItems({ search: itemSearch.trim(), per_page: 8 }).then((res) => {
        setItemResults(res.data ?? []);
      }).catch(() => setItemResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [itemSearch]);

  const patch = async (partial: Parameters<typeof updateTradeAccount>[1]) => {
    if (!account) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await updateTradeAccount(account.id, partial);
      setAccount(res.trade_account);
      setSaveMsg('Saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!account) return;
    if (!window.confirm(`Deactivate ${account.shop_name}? You can still see the history later.`)) return;
    setSaving(true);
    try {
      const res = await deactivateTradeAccount(account.id);
      setAccount(res.trade_account);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPrice = async () => {
    if (!account || !selectedItem) {
      setPriceError('Pick a menu item.');
      return;
    }
    const mvr = Number(priceMvr);
    if (Number.isNaN(mvr) || mvr < 0) {
      setPriceError('Enter a price in MVR (0 is allowed).');
      return;
    }
    const priceLaar = Math.round(mvr * 100);
    setPriceSaving(true);
    setPriceError('');
    try {
      await createTradePrice(account.id, {
        item_id: selectedItem.id,
        price_laar: priceLaar,
      });
      setPriceOpen(false);
      setSelectedItem(null);
      setPriceMvr('');
      setItemSearch('');
      await load();
    } catch (e) {
      setPriceError((e as Error).message);
    } finally {
      setPriceSaving(false);
    }
  };

  const handleRemoveAccountPrice = async (itemId: number) => {
    if (!account || !canManagePrices) return;
    try {
      const list = await fetchTradePrices(account.id);
      const entry = list.data.find((e) => e.item_id === itemId && e.variant_id == null);
      if (!entry) return;
      if (!window.confirm('Remove this shop’s agreed price? The standard wholesale or discount rule will apply instead.')) return;
      await deleteTradePrice(account.id, entry.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleDay = (day: string) => {
    if (!account || !canManageAccounts) return;
    const current = account.delivery_days ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    void patch({ delivery_days: next });
  };

  if (loading) {
    return (
      <PageShell>
        <Spinner />
      </PageShell>
    );
  }

  if (!account) {
    return (
      <PageShell>
        <ErrorMsg message={error || 'Account not found'} />
        <Btn variant="secondary" onClick={() => navigate('/wholesale')}>Back</Btn>
      </PageShell>
    );
  }

  const discountPct = account.default_discount_bp != null
    ? (account.default_discount_bp / 100).toFixed(account.default_discount_bp % 100 === 0 ? 0 : 1)
    : '';

  return (
    <PageShell>
      <div style={{ marginBottom: 8 }}>
        <Link to="/wholesale" style={{ fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>
          ← All shops
        </Link>
      </div>
      <PageHeader
        section="Wholesale"
        title={account.shop_name}
        subtitle={account.is_active ? 'Active trade account' : 'Inactive — not used for new deliveries'}
        action={canManageAccounts && account.is_active ? (
          <Btn variant="secondary" onClick={() => void handleDeactivate()} disabled={saving}>
            Deactivate
          </Btn>
        ) : undefined}
      />

      {error && <ErrorMsg message={error} />}
      {saveMsg && (
        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-success)' }}>{saveMsg}</div>
      )}

      {account.credit_warning && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            background: 'var(--color-warning-bg, var(--color-bg))',
            border: '1px solid var(--color-warning)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--color-text)',
            lineHeight: 1.5,
          }}
        >
          {account.credit_warning}
          {account.customer && (
            <>
              {' '}
              <Link
                to={`/customers?customer=${account.customer.id}`}
                style={{ color: 'var(--color-primary)', fontWeight: 600 }}
              >
                Open customer credit settings
              </Link>
            </>
          )}
        </div>
      )}

      <div
        data-responsive-grid
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, marginBottom: 28 }}
      >
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={sectionTitle}>Terms</h2>

          <Field label="Shop name">
            <Input
              value={account.shop_name}
              disabled={!canManageAccounts}
              onChange={(v) => setAccount({ ...account, shop_name: v })}
              onBlur={() => canManageAccounts && void patch({ shop_name: account.shop_name })}
            />
          </Field>

          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Contact name">
              <Input
                value={account.contact_name ?? ''}
                disabled={!canManageAccounts}
                onChange={(v) => setAccount({ ...account, contact_name: v })}
                onBlur={() => canManageAccounts && void patch({ contact_name: account.contact_name || null })}
              />
            </Field>
            <Field label="Contact phone">
              <Input
                value={account.contact_phone ?? ''}
                disabled={!canManageAccounts}
                onChange={(v) => setAccount({ ...account, contact_phone: v })}
                onBlur={() => canManageAccounts && void patch({ contact_phone: account.contact_phone || null })}
              />
            </Field>
          </div>

          <Field label="How they settle">
            <select
              value={account.settlement_mode}
              disabled={!canManageAccounts}
              onChange={(e) => void patch({ settlement_mode: e.target.value as TradeSettlementMode })}
              style={selectStyle}
            >
              {SETTLEMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p style={helpStyle}>
              {SETTLEMENT_OPTIONS.find((o) => o.value === account.settlement_mode)?.help}
            </p>
          </Field>

          <Field label="When we bill them">
            <select
              value={account.billing_cycle}
              disabled={!canManageAccounts}
              onChange={(e) => void patch({ billing_cycle: e.target.value as TradeBillingCycle })}
              style={selectStyle}
            >
              {BILLING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Payment due (days)">
            <Input
              type="number"
              min={0}
              placeholder={`Same as customer (${account.customer?.credit_payment_terms_days ?? 30})`}
              value={account.payment_terms_days ?? ''}
              disabled={!canManageAccounts}
              onChange={(v) => {
                setAccount({
                  ...account,
                  payment_terms_days: v === '' ? null : Number(v),
                });
              }}
              onBlur={() => canManageAccounts && void patch({ payment_terms_days: account.payment_terms_days })}
            />
            <p style={helpStyle}>
              Currently using {account.resolved_payment_terms_days} days
              {account.payment_terms_days == null ? ' (from the customer record)' : ''}.
            </p>
          </Field>

          <Field label="If they lose it or don’t return it">
            <select
              value={account.missing_policy}
              disabled={!canManageAccounts}
              onChange={(e) => void patch({ missing_policy: e.target.value as TradeMissingPolicy })}
              style={selectStyle}
            >
              {MISSING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Default discount off retail (%)">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="Leave blank if every item has its own price"
              value={discountPct}
              disabled={!canManageAccounts}
              onChange={(v) => {
                if (v === '') {
                  setAccount({ ...account, default_discount_bp: null });
                  return;
                }
                const pct = Number(v);
                if (Number.isNaN(pct)) return;
                setAccount({ ...account, default_discount_bp: Math.round(pct * 100) });
              }}
              onBlur={() => canManageAccounts && void patch({ default_discount_bp: account.default_discount_bp })}
            />
            <p style={helpStyle}>
              Used only when this shop has no own price and the item has no standard wholesale price.
              Never follows weekend offers or daily specials.
            </p>
          </Field>

          <Field label="Usual delivery days">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {WEEKDAYS.map((day) => {
                const on = (account.delivery_days ?? []).includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!canManageAccounts}
                    onClick={() => toggleDay(day)}
                    style={{
                      minHeight: 36,
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: on ? 'var(--color-primary-soft, var(--color-bg))' : 'transparent',
                      color: on ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: canManageAccounts ? 'pointer' : 'default',
                    }}
                  >
                    {WEEKDAY_LABEL[day]}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Notes">
            <textarea
              value={account.notes ?? ''}
              disabled={!canManageAccounts}
              rows={3}
              onChange={(e) => setAccount({ ...account, notes: e.target.value })}
              onBlur={() => canManageAccounts && void patch({ notes: account.notes || null })}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: 13,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </Field>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={sectionTitle}>Customer credit (read-only)</h2>
          <div
            style={{
              padding: 16,
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              background: 'var(--color-bg)',
            }}
          >
            {account.customer ? (
              <>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  <Link
                    to={`/customers?customer=${account.customer.id}`}
                    style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                  >
                    {account.customer.name ?? account.customer.phone}
                  </Link>
                </div>
                <dl style={{ margin: 0, display: 'grid', gap: 8, fontSize: 13 }}>
                  <Row label="Credit enabled" value={account.customer.credit_enabled ? 'Yes' : 'No'} />
                  <Row label="Status" value={account.customer.credit_status ?? '—'} />
                  <Row label="Limit" value={formatMvrFromLaar(account.customer.credit_limit_laar)} />
                  <Row label="Balance owed" value={formatMvrFromLaar(account.customer.credit_balance_laar)} />
                </dl>
                <p style={{ ...helpStyle, marginTop: 12 }}>
                  Change credit limit and status on the customer page — not here.
                </p>
              </>
            ) : (
              <EmptyState>No customer linked</EmptyState>
            )}
          </div>
        </section>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ ...sectionTitle, margin: 0 }}>Price list</h2>
          <p style={{ ...helpStyle, margin: '4px 0 0' }}>
            Green = agreed for this shop. Amber = standard wholesale. Grey = guessed from retail discount.
          </p>
        </div>
        {canManagePrices && (
          <Btn onClick={() => setPriceOpen(true)}>Set shop price</Btn>
        )}
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Item', 'Price', 'Where it came from', ''].map((h) => (
                <th
                  key={h || 'actions'}
                  style={{
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resolved.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState>No active menu items to price.</EmptyState>
                </td>
              </tr>
            ) : resolved.map((row) => (
              <tr key={`${row.item_id}-${row.variant_id ?? 'base'}`} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>
                  {row.item_name}
                  {row.sku && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 400 }}>{row.sku}</div>
                  )}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>
                  {row.found ? formatMvrFromLaar(row.price_laar) : (
                    <span style={{ color: 'var(--color-danger)' }}>No price</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <SourceBadge source={row.source} />
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {canManagePrices && row.has_account_entry && (
                    <Btn variant="secondary" onClick={() => void handleRemoveAccountPrice(row.item_id)}>
                      Clear shop price
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {priceOpen && (
        <Modal title="Set this shop’s price" onClose={() => setPriceOpen(false)}>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            This overrides the standard wholesale price and the retail discount for this shop only.
            Enter MVR; we store it in laari (GST-inclusive).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Menu item">
              {selectedItem ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ flex: 1 }}>{selectedItem.name}</strong>
                  <Btn variant="secondary" onClick={() => setSelectedItem(null)}>Change</Btn>
                </div>
              ) : (
                <>
                  <Input
                    value={itemSearch}
                    onChange={setItemSearch}
                    placeholder="Search menu…"
                  />
                  {itemResults.length > 0 && (
                    <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, border: '1px solid var(--color-border)', borderRadius: 8 }}>
                      {itemResults.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => { setSelectedItem(item); setItemSearch(''); setItemResults([]); }}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '10px 12px',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              fontSize: 13,
                              color: 'var(--color-text)',
                            }}
                          >
                            {item.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Field>
            <Field label="Agreed price (MVR)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={priceMvr}
                onChange={setPriceMvr}
                placeholder="0.00"
              />
            </Field>
            {priceError && <ErrorMsg message={priceError} />}
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setPriceOpen(false)}>Cancel</Btn>
            <Btn onClick={() => void handleAddPrice()} disabled={priceSaving}>
              {priceSaving ? 'Saving…' : 'Save price'}
            </Btn>
          </ModalActions>
        </Modal>
      )}
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <dt style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
    </div>
  );
}

function SourceBadge({ source }: { source: TradePriceSource }) {
  const color =
    source === 'account_list' ? 'green'
      : source === 'item_wholesale' ? 'orange'
        : source === 'retail_discount' ? 'gray'
          : 'red';
  return <Badge color={color}>{SOURCE_LABEL[source]}</Badge>;
}

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--color-text)',
  margin: '0 0 4px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 6,
};

const helpStyle: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  color: 'var(--color-text-muted)',
  lineHeight: 1.45,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface, var(--color-bg))',
  color: 'var(--color-text)',
  fontSize: 13,
  fontFamily: 'inherit',
};
