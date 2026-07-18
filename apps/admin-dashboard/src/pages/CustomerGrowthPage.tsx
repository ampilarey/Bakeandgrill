import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchCustomerGrowthMetrics, fetchCustomerSegments, fetchCustomerSegment,
  fetchCustomerDataQuality,
  fetchMarketingAutomation, updateMarketingAutomation,
  fetchCorporateInquiries, updateCorporateInquiryStatus, fetchItemPairs,
  type CustomerGrowthMetrics, type CustomerSegmentMeta, type CustomerSegmentRow,
  type CustomerDataQualityReport, type MarketingAutomationSettings,
  type CorporateInquiry, type ItemPairRow,
} from '../api';
import { Customer360Drawer } from '../components/Customer360Drawer';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  Btn, Card, EmptyState, ErrorMsg, Input, PageHeader, Spinner,
  StatCard, TableCard, TD, TH,
} from '../components/SharedUI';

type Tab = 'overview' | 'segments' | 'marketing' | 'quality' | 'corporate' | 'pairs';

const TAB_STYLE = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
  fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
  background: active ? '#D4813A' : 'transparent',
  color: active ? '#fff' : '#6B5D4F',
});

export function CustomerGrowthPage() {
  usePageTitle('Customer Growth');
  const { can } = useCurrentUserPermissions();
  const canAnalytics = can('customers.analytics');

  const [tab, setTab] = useState<Tab>('overview');
  const [metrics, setMetrics] = useState<CustomerGrowthMetrics | null>(null);
  const [segments, setSegments] = useState<CustomerSegmentMeta[]>([]);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [segmentRows, setSegmentRows] = useState<CustomerSegmentRow[]>([]);
  const [segmentMeta, setSegmentMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [segmentSearch, setSegmentSearch] = useState('');
  const [quality, setQuality] = useState<CustomerDataQualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view360Id, setView360Id] = useState<number | null>(null);
  const [marketingSegment, setMarketingSegment] = useState('sms_opt_in');
  const [draftSms, setDraftSms] = useState('');
  const [automation, setAutomation] = useState<MarketingAutomationSettings | null>(null);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationMsg, setAutomationMsg] = useState('');
  const [corpInquiries, setCorpInquiries] = useState<CorporateInquiry[]>([]);
  const [corpMeta, setCorpMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [corpPage, setCorpPage] = useState(1);
  const [itemPairs, setItemPairs] = useState<ItemPairRow[]>([]);
  const [pairsMeta, setPairsMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [pairsPage, setPairsPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const segRes = await fetchCustomerSegments();
        setSegments(segRes.segments ?? []);
        if (canAnalytics) {
          const m = await fetchCustomerGrowthMetrics();
          setMetrics(m.metrics);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [canAnalytics]);

  useEffect(() => {
    if (tab !== 'segments' && tab !== 'marketing') return;
    if (!activeSegment && tab === 'segments') return;
    const slug = tab === 'marketing' ? marketingSegment : activeSegment;
    if (!slug) return;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchCustomerSegment(slug, { search: segmentSearch || undefined, page: 1 });
        setSegmentRows(res.data ?? []);
        setSegmentMeta(res.meta ?? { current_page: 1, last_page: 1, total: 0 });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(() => { void load(); }, 300);
    return () => clearTimeout(t);
  }, [tab, activeSegment, marketingSegment, segmentSearch]);

  useEffect(() => {
    if (tab !== 'quality') return;
    setLoading(true);
    fetchCustomerDataQuality()
      .then((r) => setQuality(r.report))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'marketing') return;
    fetchMarketingAutomation()
      .then((r) => setAutomation(r.settings))
      .catch((e: Error) => setAutomationMsg(e.message));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'corporate') return;
    setLoading(true);
    fetchCorporateInquiries({ page: corpPage })
      .then((r) => {
        setCorpInquiries(r.data ?? []);
        setCorpMeta(r.meta ?? { current_page: 1, last_page: 1, total: 0 });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, corpPage]);

  useEffect(() => {
    if (tab !== 'pairs' || !canAnalytics) return;
    setLoading(true);
    fetchItemPairs({ page: pairsPage })
      .then((r) => {
        setItemPairs(r.data ?? []);
        setPairsMeta(r.meta ?? { current_page: 1, last_page: 1, total: 0 });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, pairsPage, canAnalytics]);

  const saveAutomation = async () => {
    if (!automation) return;
    setAutomationSaving(true);
    setAutomationMsg('');
    try {
      const res = await updateMarketingAutomation(automation);
      setAutomation(res.settings);
      setAutomationMsg('Automation settings saved.');
    } catch (e) {
      setAutomationMsg((e as Error).message);
    } finally {
      setAutomationSaving(false);
    }
  };

  const marketingOptIn = segments.find((s) => s.slug === marketingSegment)?.count ?? 0;
  const marketingOptOut = segments.find((s) => s.slug === 'sms_opt_out')?.count ?? 0;

  return (
    <>
      <PageHeader
        title="Customer Growth"
        subtitle="Metrics, segments, CRM tools, and data quality"
        action={<Link to="/customers" style={{ fontSize: 14, color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}>← Customer list</Link>}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['overview', 'segments', 'marketing', 'corporate', 'pairs', 'quality'] as Tab[]).map((t) => (
          <button key={t} type="button" style={TAB_STYLE(tab === t)} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'segments' ? 'Segments' : t === 'marketing' ? 'Marketing' : t === 'corporate' ? 'Corporate' : t === 'pairs' ? 'Item Pairs' : 'Data Quality'}
          </button>
        ))}
      </div>

      {error && <ErrorMsg message={error} />}

      {tab === 'overview' && (
        loading && !metrics ? <Spinner /> : !canAnalytics ? (
          <Card><EmptyState message="You need customers.analytics permission to view growth metrics." /></Card>
        ) : metrics ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
              <StatCard label="Total customers" value={String(metrics.total_customers)} />
              <StatCard label="New (30d)" value={String(metrics.new_customers_30d)} />
              <StatCard label="Active (30d)" value={String(metrics.active_customers_30d)} />
              <StatCard label="Repeat rate" value={`${metrics.repeat_rate}%`} />
              <StatCard label="Avg LTV" value={`MVR ${metrics.average_lifetime_value.toFixed(0)}`} />
              <StatCard label="Dormant 30d+" value={String(metrics.dormant_30d)} />
              <StatCard label="SMS opt-in" value={String(metrics.sms_opt_in_count)} />
              <StatCard label="Credit exposure" value={`${(metrics.total_credit_balance / 100).toFixed(0)} MVR`} />
            </div>
            <Card>
              <p style={{ margin: '0 0 12px', fontWeight: 700 }}>Weekly trends</p>
              <TableCard>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Week', 'New customers', 'Returning', 'Repeat %'].map((h) => <th key={h} style={TH}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics.trends ?? []).slice(-8).map((row) => (
                      <tr key={row.week}>
                        <td style={TD}>{row.week}</td>
                        <td style={TD}>{row.new_customers}</td>
                        <td style={TD}>{row.returning_order_customers}</td>
                        <td style={TD}>{row.repeat_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </Card>
          </>
        ) : null
      )}

      {tab === 'segments' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
            {segments.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => setActiveSegment(s.slug)}
                style={{
                  textAlign: 'left', padding: 12, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                  border: activeSegment === s.slug ? '2px solid #D4813A' : '1px solid #E8E0D8',
                  background: activeSegment === s.slug ? '#FEF3E2' : '#fff',
                }}
              >
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{s.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: '#D4813A' }}>{s.count}</p>
              </button>
            ))}
          </div>
          {activeSegment && (
            <>
              <Input value={segmentSearch} onChange={setSegmentSearch} placeholder="Search segment…" style={{ maxWidth: 320, marginBottom: 12 }} />
              {loading ? <Spinner /> : (
                <TableCard>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Customer', 'Phone', 'Paid orders', 'Spend', 'Last order', ''].map((h) => <th key={h} style={TH}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {segmentRows.map((r) => (
                        <tr key={r.id}>
                          <td style={TD}>{r.name ?? '—'}</td>
                          <td style={TD}>{r.phone}</td>
                          <td style={TD}>{r.orders_count_paid}</td>
                          <td style={TD}>MVR {r.total_paid_spend.toFixed(2)}</td>
                          <td style={TD}>{r.last_order_at ? new Date(r.last_order_at).toLocaleDateString() : '—'}</td>
                          <td style={TD}><Btn small variant="ghost" onClick={() => setView360Id(r.id)}>360</Btn></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ padding: 12, fontSize: 12, color: '#9C8E7E' }}>{segmentMeta.total} customers</p>
                </TableCard>
              )}
            </>
          )}
        </>
      )}

      {tab === 'marketing' && (
        <>
        <Card>
          <p style={{ margin: '0 0 12px', fontWeight: 700 }}>Automated campaigns</p>
          {automationMsg && (
            <p style={{ fontSize: 13, color: automationMsg.includes('saved') ? '#15803D' : '#B91C1C', marginBottom: 12 }}>{automationMsg}</p>
          )}
          {!automation ? (
            <Spinner />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={automation.birthday_enabled} onChange={(e) => setAutomation({ ...automation, birthday_enabled: e.target.checked })} />
                Birthday loyalty bonus + SMS
              </label>
              <Input label="Birthday bonus points" type="number" value={String(automation.birthday_points)} onChange={(v) => setAutomation({ ...automation, birthday_points: Number(v) })} />
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Birthday SMS template</label>
              <textarea value={automation.birthday_sms_template} onChange={(e) => setAutomation({ ...automation, birthday_sms_template: e.target.value })} rows={2} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit' }} />

              {!automation.abandoned_cart_enabled && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: '#FEF3C7',
                  border: '1px solid #F59E0B',
                  color: '#92400E',
                  fontSize: 13,
                  lineHeight: 1.45,
                }}>
                  Abandoned cart recovery is <strong>OFF</strong>. Guest and signed-in carts can be snapshotted, but no reminder SMS will send until you enable this and save.
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginTop: 8 }}>
                <input type="checkbox" checked={automation.abandoned_cart_enabled} onChange={(e) => setAutomation({ ...automation, abandoned_cart_enabled: e.target.checked })} />
                Abandoned cart recovery SMS
              </label>
              <Input label="Delay before SMS (minutes)" type="number" value={String(automation.abandoned_cart_delay_minutes)} onChange={(v) => setAutomation({ ...automation, abandoned_cart_delay_minutes: Number(v) })} />
              <Input label="Cart snapshot retention (days)" type="number" value={String(automation.abandoned_cart_ttl_days)} onChange={(v) => setAutomation({ ...automation, abandoned_cart_ttl_days: Number(v) })} />
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Abandoned cart SMS template</label>
              <textarea value={automation.abandoned_cart_sms_template} onChange={(e) => setAutomation({ ...automation, abandoned_cart_sms_template: e.target.value })} rows={2} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit' }} />

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginTop: 8 }}>
                <input type="checkbox" checked={automation.tier_milestone_enabled} onChange={(e) => setAutomation({ ...automation, tier_milestone_enabled: e.target.checked })} />
                Tier milestone SMS (near next loyalty tier)
              </label>
              <Input label="Points within next tier" type="number" value={String(automation.tier_milestone_within)} onChange={(v) => setAutomation({ ...automation, tier_milestone_within: Number(v) })} />
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Tier milestone SMS template</label>
              <textarea value={automation.tier_milestone_sms_template} onChange={(e) => setAutomation({ ...automation, tier_milestone_sms_template: e.target.value })} rows={2} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit' }} />

              <Btn onClick={() => void saveAutomation()} disabled={automationSaving}>
                {automationSaving ? 'Saving…' : 'Save automation settings'}
              </Btn>
              <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>
                Only customers who have not opted out of SMS receive these messages. One SMS per birthday per year, one per cart snapshot, and one tier milestone SMS per customer per day.
              </p>
            </div>
          )}
        </Card>
        <Card>
          <p style={{ margin: '0 0 12px', fontWeight: 700 }}>Segment outreach</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <select value={marketingSegment} onChange={(e) => setMarketingSegment(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #E8E0D8' }}>
              {segments.map((s) => <option key={s.slug} value={s.slug}>{s.label} ({s.count})</option>)}
            </select>
            <StatCard label="Selected segment" value={String(marketingOptIn)} />
            <StatCard label="Opt-out (excluded)" value={String(marketingOptOut)} />
          </div>
          <textarea
            value={draftSms}
            onChange={(e) => setDraftSms(e.target.value)}
            rows={4}
            placeholder="Draft SMS message…"
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit' }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Link to="/sms" style={{ textDecoration: 'none' }}>
              <Btn variant="secondary">Open SMS Campaigns →</Btn>
            </Link>
          </div>
          <p style={{ fontSize: 12, color: '#9C8E7E', marginTop: 12 }}>
            Bulk send uses existing SMS Campaigns. Opt-out customers are never included in campaigns when opted_in filter is enabled.
          </p>
        </Card>
        </>
      )}

      {tab === 'corporate' && (
        loading && corpInquiries.length === 0 ? <Spinner /> : (
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Contact', 'Phone', 'Company', 'Headcount', 'Notes', 'Status', 'Submitted'].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corpInquiries.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState message="No corporate inquiries yet." /></td></tr>
                ) : corpInquiries.map((row) => (
                  <tr key={row.id}>
                    <td style={TD}>{row.contact_name}</td>
                    <td style={TD}>{row.phone}</td>
                    <td style={TD}>{row.company ?? '—'}</td>
                    <td style={TD}>{row.headcount ?? '—'}</td>
                    <td style={{ ...TD, maxWidth: 220, fontSize: 12 }}>{row.notes ?? '—'}</td>
                    <td style={TD}>
                      <select
                        value={row.status}
                        onChange={(e) => {
                          const status = e.target.value as 'new' | 'contacted' | 'closed';
                          void updateCorporateInquiryStatus(row.id, status)
                            .then(() => {
                              setCorpInquiries((list) => list.map((r) => (r.id === row.id ? { ...r, status } : r)));
                            })
                            .catch((err) => setError((err as Error).message));
                        }}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E8E0D8', fontSize: 12 }}
                      >
                        <option value="new">new</option>
                        <option value="contacted">contacted</option>
                        <option value="closed">closed</option>
                      </select>
                    </td>
                    <td style={{ ...TD, color: '#9C8E7E' }}>{new Date(row.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ padding: 12, fontSize: 12, color: '#9C8E7E' }}>
              {corpMeta.total} inquiries
              {corpMeta.last_page > 1 && (
                <>
                  {' · '}
                  <button type="button" disabled={corpPage <= 1} onClick={() => setCorpPage((p) => p - 1)} style={{ marginRight: 8, fontFamily: 'inherit', cursor: 'pointer' }}>Prev</button>
                  <button type="button" disabled={corpPage >= corpMeta.last_page} onClick={() => setCorpPage((p) => p + 1)} style={{ fontFamily: 'inherit', cursor: 'pointer' }}>Next</button>
                </>
              )}
            </p>
          </TableCard>
        )
      )}

      {tab === 'pairs' && (
        !canAnalytics ? (
          <Card><EmptyState message="You need customers.analytics permission to view item pairs." /></Card>
        ) : loading && itemPairs.length === 0 ? <Spinner /> : (
          <TableCard>
            <p style={{ padding: '12px 14px 0', margin: 0, fontSize: 13, color: '#6B5D4F' }}>
              Frequently bought together — based on completed orders (run nightly via insights:compute-item-pairs).
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Item', 'Often paired with', 'Times together'].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemPairs.length === 0 ? (
                  <tr><td colSpan={3}><EmptyState message="No pair stats yet — needs order history." /></td></tr>
                ) : itemPairs.map((row) => (
                  <tr key={`${row.item_id}-${row.paired_item_id}`}>
                    <td style={TD}>{row.item_name}</td>
                    <td style={TD}>{row.paired_item_name}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{row.pair_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ padding: 12, fontSize: 12, color: '#9C8E7E' }}>
              {pairsMeta.total} pairs
              {pairsMeta.last_page > 1 && (
                <>
                  {' · '}
                  <button type="button" disabled={pairsPage <= 1} onClick={() => setPairsPage((p) => p - 1)} style={{ marginRight: 8, fontFamily: 'inherit', cursor: 'pointer' }}>Prev</button>
                  <button type="button" disabled={pairsPage >= pairsMeta.last_page} onClick={() => setPairsPage((p) => p + 1)} style={{ fontFamily: 'inherit', cursor: 'pointer' }}>Next</button>
                </>
              )}
            </p>
          </TableCard>
        )
      )}

      {tab === 'quality' && (
        loading && !quality ? <Spinner /> : quality ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {([
              ['missing_names', 'Missing names', quality.missing_names],
              ['no_order_yet', 'No paid orders', quality.no_order_yet],
              ['cancelled_only', 'Cancelled only', quality.cancelled_only],
              ['invalid_phones', 'Invalid phones', quality.invalid_phones],
              ['merge_suggestions', 'Merge suggestions', quality.merge_suggestions],
            ] as const).map(([key, title, section]) => (
              <Card key={key}>
                <p style={{ margin: '0 0 8px', fontWeight: 700 }}>{title} ({section.count})</p>
                {section.rows.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9C8E7E' }}>None found.</p>
                ) : (
                  section.rows.slice(0, 10).map((row, i) => (
                    <div key={i} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid #F0EBE5' }}>
                      {JSON.stringify(row)}
                      {'id' in row && typeof row.id === 'number' && (
                        <Btn small variant="ghost" onClick={() => setView360Id(row.id as number)} style={{ marginLeft: 8 }}>View</Btn>
                      )}
                      {'primary_id' in row && (
                        <Link to="/customers" style={{ marginLeft: 8, fontSize: 12, color: '#D4813A' }}>Review merge in Customers</Link>
                      )}
                    </div>
                  ))
                )}
              </Card>
            ))}
          </div>
        ) : null
      )}

      {view360Id != null && (
        <Customer360Drawer customerId={view360Id} onClose={() => setView360Id(null)} />
      )}
    </>
  );
}
