import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Store } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, PageShell, TableCard, Badge, Btn, Modal, ModalActions,
  Pagination, EmptyState, Spinner, ErrorMsg, Input,
} from '../components/SharedUI';
import { CustomerSearch } from '../components/CustomerSearch';
import {
  createTradeAccount,
  fetchTradeAccounts,
  type TradeAccount,
} from '../api';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

const SETTLEMENT_LABEL: Record<string, string> = {
  sale_or_return: 'Sale or return',
  firm_sale: 'Firm sale',
};

const BILLING_LABEL: Record<string, string> = {
  weekly: 'Every week',
  fortnightly: 'Every two weeks',
  monthly: 'Every month',
  per_delivery: 'Each delivery',
};

export default function WholesalePage() {
  usePageTitle('Wholesale');
  const navigate = useNavigate();
  const { can } = useCurrentUserPermissions();
  const canManage = can('trade.manage_accounts');

  const [accounts, setAccounts] = useState<TradeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [shopName, setShopName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchTradeAccounts({
        page,
        search: search || undefined,
        active: activeOnly ? true : undefined,
      });
      setAccounts(res.data ?? []);
      setLastPage(res.meta?.last_page ?? 1);
      setTotal(res.meta?.total ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, search, activeOnly]);

  const handleCreate = async () => {
    if (!customerId || !shopName.trim()) {
      setCreateError('Pick a customer and enter the shop name.');
      return;
    }
    setSaving(true);
    setCreateError('');
    try {
      const res = await createTradeAccount({
        customer_id: customerId,
        shop_name: shopName.trim(),
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
      });
      setCreateOpen(false);
      setCustomerId(null);
      setShopName('');
      setContactName('');
      setContactPhone('');
      navigate(`/wholesale/${res.trade_account.id}`);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        section="Wholesale"
        title="Shops we supply"
        subtitle={`${total} trade account${total !== 1 ? 's' : ''}`}
        action={canManage ? (
          <Btn onClick={() => setCreateOpen(true)}>
            <Store size={16} style={{ marginRight: 6 }} />
            Add shop
          </Btn>
        ) : undefined}
      />

      {error && <ErrorMsg message={error} />}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
          style={{ display: 'flex', gap: 8, flex: 1, minWidth: 220 }}
        >
          <Input
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search shop or contact…"
            style={{ flex: 1 }}
          />
          <Btn type="submit" variant="secondary">Search</Btn>
        </form>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => { setActiveOnly(e.target.checked); setPage(1); }}
          />
          Active only
        </label>
      </div>

      {loading ? <Spinner /> : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Shop', 'Customer', 'How they pay', 'Billing', 'Credit', 'Status'].map((h) => (
                  <th
                    key={h}
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
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState>No trade accounts yet. Add a shop we supply on sale-or-return or firm sale.</EmptyState>
                  </td>
                </tr>
              ) : accounts.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <Link
                      to={`/wholesale/${a.id}`}
                      style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-primary)', textDecoration: 'none' }}
                    >
                      {a.shop_name}
                    </Link>
                    {a.contact_name && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {a.contact_name}
                        {a.contact_phone ? ` · ${a.contact_phone}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    {a.customer ? (
                      <Link to={`/customers?customer=${a.customer.id}`} style={{ color: 'var(--color-text)', textDecoration: 'none' }}>
                        {a.customer.name ?? a.customer.phone}
                      </Link>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {SETTLEMENT_LABEL[a.settlement_mode] ?? a.settlement_mode}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {BILLING_LABEL[a.billing_cycle] ?? a.billing_cycle}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {a.customer?.credit_enabled ? (
                      <Badge color="green">{a.customer.credit_status ?? 'active'}</Badge>
                    ) : (
                      <Badge color="orange">Credit off</Badge>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge color={a.is_active ? 'green' : 'gray'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lastPage > 1 && (
            <Pagination page={page} totalPages={lastPage} onChange={setPage} />
          )}
        </TableCard>
      )}

      {createOpen && (
        <Modal title="Add a shop we supply" onClose={() => setCreateOpen(false)}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Pick the customer record for this shop. Credit limit and balance stay on the customer — turn credit on under Customers if they will pay on account.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Customer</label>
              <CustomerSearch
                value={customerId}
                onChange={(id) => setCustomerId(id)}
                placeholder="Search by name or phone…"
              />
            </div>
            <div>
              <label style={labelStyle}>Shop name</label>
              <Input value={shopName} onChange={setShopName} placeholder="e.g. Island Mart Hulhumalé" />
            </div>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Contact name (optional)</label>
                <Input value={contactName} onChange={setContactName} />
              </div>
              <div>
                <label style={labelStyle}>Contact phone (optional)</label>
                <Input value={contactPhone} onChange={setContactPhone} />
              </div>
            </div>
            {createError && <ErrorMsg message={createError} />}
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Btn>
            <Btn onClick={() => void handleCreate()} disabled={saving}>
              {saving ? 'Saving…' : 'Create account'}
            </Btn>
          </ModalActions>
        </Modal>
      )}
    </PageShell>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 6,
};
