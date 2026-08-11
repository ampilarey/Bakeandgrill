import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  PageHeader,
  PageShell,
  TableCard,
  TH,
  TD,
  Badge,
  Btn,
  StatCard,
  EmptyState,
  ErrorMsg,
  Spinner,
} from '../components/SharedUI';
import { Tabs, TabList, Tab } from '../components/ui/Tabs';
import { Toggle } from '../components/ui/Toggle';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  fetchKitchenHandoverSettings,
  updateKitchenHandoverSettings,
  fetchKitchenProductionBatches,
  fetchKitchenReceivingPending,
  fetchKitchenVariances,
  reviewKitchenVariance,
  fetchKitchenProductionSummary,
  fetchKitchenHandoverReport,
  fetchKitchenWasteReport,
  fetchKitchenStaffOutputReport,
  fetchKitchenPosReceivingReport,
  receiveKitchenBatchAll,
  submitKitchenProductionBatch,
  cancelKitchenProductionBatch,
  type KitchenHandoverSettings,
  type KitchenProductionBatch,
  type KitchenVariance,
} from '../api/kitchen-production';

const ALL_TABS = [
  { id: 'live', label: 'Live Handover', needs: 'reports' as const },
  { id: 'batches', label: 'Production Batches', needs: 'any' as const },
  { id: 'receiving', label: 'POS Receiving', needs: 'any' as const },
  { id: 'variances', label: 'Variances', needs: 'variance' as const },
  { id: 'waste', label: 'Waste / Remakes', needs: 'reports' as const },
  { id: 'staff', label: 'Staff Output', needs: 'reports' as const },
  { id: 'settings', label: 'Settings', needs: 'manage' as const },
] as const;

type TabId = (typeof ALL_TABS)[number]['id'];

const SUMMARY_META: Record<string, { label: string; accent: string; sub?: string }> = {
  batches_created: { label: 'Batches created', accent: 'var(--color-primary)', sub: 'Today' },
  pending_receive: { label: 'Pending receive', accent: 'var(--color-warning)', sub: 'Awaiting POS' },
  received: { label: 'Received', accent: 'var(--color-success)', sub: 'Today' },
  waste_count: { label: 'Waste events', accent: 'var(--color-danger)', sub: 'Today' },
  remake_count: { label: 'Remakes', accent: 'var(--color-warning)', sub: 'Today' },
};

const BATCH_STATUS_COLOR: Record<string, string> = {
  draft: 'gray',
  submitted: 'orange',
  partially_received: 'yellow',
  received: 'green',
  cancelled: 'red',
};

const HANDOVER_STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  handed_over: 'blue',
  received: 'green',
  partial: 'yellow',
  cancelled: 'gray',
};

const VARIANCE_COLOR: Record<string, string> = {
  waste: 'red',
  remake: 'orange',
  rejected: 'red',
  short: 'yellow',
  over: 'blue',
};

const SETTINGS_META: Record<keyof KitchenHandoverSettings, { label: string; hint: string }> = {
  kitchen_require_pos_receiving_before_ready: {
    label: 'Require POS receive before ready',
    hint: 'Kitchen cannot mark an order ready until the counter has received the batch.',
  },
  kitchen_receive_updates_prepared_stock: {
    label: 'Receiving updates prepared stock',
    hint: 'POS receive adjusts prepared-stock quantities automatically.',
  },
  kitchen_manager_verification_for_prepared_stock: {
    label: 'Manager verification for prepared stock',
    hint: 'A manager must confirm prepared-stock changes from kitchen batches.',
  },
  kitchen_allow_staff_prepared_stock_batches: {
    label: 'Staff may create prepared-stock batches',
    hint: 'Kitchen staff can open prepared-stock production batches without a manager.',
  },
  kitchen_photo_required_for_reject_waste: {
    label: 'Photo required for reject / waste',
    hint: 'Reject and waste variances must include a photo attachment.',
  },
  kitchen_production_consumes_recipe_stock: {
    label: 'Production consumes recipe stock',
    hint: 'Submitting a batch deducts recipe ingredients from inventory.',
  },
};

function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function statusBadge(status: string, map: Record<string, string> = BATCH_STATUS_COLOR) {
  return <Badge color={map[status] ?? 'gray'}>{titleCase(status)}</Badge>;
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
      flexWrap: 'wrap',
    }}>
      <h3 style={{
        margin: 0,
        fontSize: 15,
        fontWeight: 800,
        color: 'var(--color-text)',
        letterSpacing: '-0.01em',
      }}>
        {children}
      </h3>
      {action}
    </div>
  );
}

function BatchMeta({ batch }: { batch: KitchenProductionBatch }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{batch.batch_no}</strong>
        {statusBadge(batch.status)}
        <Badge color="gray">{titleCase(batch.production_type)}</Badge>
        {batch.station ? <Badge color="teal">{batch.station}</Badge> : null}
      </div>
      <div style={{
        fontSize: 13,
        color: 'var(--color-text-secondary)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 12px',
      }}>
        {batch.order?.order_number && batch.order?.id ? (
          <span>
            Order{' '}
            <Link
              to={`/orders?order=${batch.order.id}`}
              style={{ color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none' }}
            >
              {batch.order.order_number}
            </Link>
          </span>
        ) : (
          <span>No linked order</span>
        )}
        {batch.producer?.name ? <span>By {batch.producer.name}</span> : null}
        {batch.submitted_at ? <span>Submitted {fmtWhen(batch.submitted_at)}</span> : null}
        {!batch.submitted_at && batch.created_at ? <span>Created {fmtWhen(batch.created_at)}</span> : null}
      </div>
      {(batch.items?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {batch.items.map((item) => (
            <span
              key={item.id}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: '4px 8px',
              }}
            >
              {item.name} × {item.expected_receive_qty}{item.unit ? ` ${item.unit}` : ''}
            </span>
          ))}
        </div>
      )}
      {batch.notes ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>{batch.notes}</p>
      ) : null}
    </div>
  );
}

export default function KitchenProductionPage() {
  usePageTitle('Kitchen Handover');
  const { can } = useCurrentUserPermissions();
  const canManage = can('kitchen.production.manage');
  const canReports = can('kitchen.production.reports') || can('kitchen.production.view_all');
  const canReceive = can('kitchen.receiving.receive');
  const canSubmit = can('kitchen.production.submit');
  const canReviewVariance = can('kitchen.variance.review');

  const visibleTabs = useMemo(
    () => ALL_TABS.filter((t) => {
      if (t.needs === 'reports') return canReports;
      if (t.needs === 'manage') return canManage;
      if (t.needs === 'variance') return canReviewVariance;
      return true;
    }),
    [canReports, canManage, canReviewVariance],
  );

  const [tab, setTab] = useState<TabId>('live');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [handoverRows, setHandoverRows] = useState<Array<Record<string, unknown>>>([]);
  const [batches, setBatches] = useState<KitchenProductionBatch[]>([]);
  const [pending, setPending] = useState<KitchenProductionBatch[]>([]);
  const [variances, setVariances] = useState<KitchenVariance[]>([]);
  const [wasteRows, setWasteRows] = useState<Array<Record<string, unknown>>>([]);
  const [staffRows, setStaffRows] = useState<Array<{ name: string; batch_count: number }>>([]);
  const [receivingRows, setReceivingRows] = useState<Array<Record<string, unknown>>>([]);
  const [settings, setSettings] = useState<KitchenHandoverSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab]);

  useEffect(() => {
    setLoading(true);
    setErr('');
    const run = async () => {
      try {
        if (tab === 'live' && canReports) {
          const [s, h] = await Promise.all([
            fetchKitchenProductionSummary(),
            fetchKitchenHandoverReport(),
          ]);
          setSummary(s.summary);
          setHandoverRows(h.data ?? []);
        } else if (tab === 'batches') {
          const res = await fetchKitchenProductionBatches();
          setBatches(res.data ?? []);
        } else if (tab === 'receiving') {
          const [p, r] = await Promise.all([
            fetchKitchenReceivingPending(),
            canReports ? fetchKitchenPosReceivingReport() : Promise.resolve({ data: [] }),
          ]);
          setPending(p.data ?? []);
          setReceivingRows(r.data ?? []);
        } else if (tab === 'variances' && canReviewVariance) {
          const res = await fetchKitchenVariances(false);
          setVariances(res.data ?? []);
        } else if (tab === 'waste' && canReports) {
          const res = await fetchKitchenWasteReport();
          setWasteRows(res.data ?? []);
        } else if (tab === 'staff' && canReports) {
          const res = await fetchKitchenStaffOutputReport();
          setStaffRows(res.data ?? []);
        } else if (tab === 'settings' && canManage) {
          const res = await fetchKitchenHandoverSettings();
          setSettings(res.settings);
        }
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [tab, canReports, canManage, canReviewVariance]);

  const saveSettings = async () => {
    if (!settings) return;
    setSettingsBusy(true);
    setErr('');
    try {
      const res = await updateKitchenHandoverSettings(settings);
      setSettings(res.settings);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleReview = async (id: number) => {
    try {
      await reviewKitchenVariance(id);
      setVariances((rows) => rows.filter((v) => v.id !== id));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const refreshReceiving = async () => {
    const [p, r] = await Promise.all([
      fetchKitchenReceivingPending(),
      canReports ? fetchKitchenPosReceivingReport() : Promise.resolve({ data: [] }),
    ]);
    setPending(p.data ?? []);
    setReceivingRows(r.data ?? []);
  };

  const handleReceiveAll = async (batchId: number) => {
    setBusyId(batchId);
    setErr('');
    try {
      await receiveKitchenBatchAll(batchId, { receive_location: 'pos_counter' });
      await refreshReceiving();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmitBatch = async (batchId: number) => {
    setBusyId(batchId);
    setErr('');
    try {
      await submitKitchenProductionBatch(batchId);
      const res = await fetchKitchenProductionBatches();
      setBatches(res.data ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelBatch = async (batchId: number) => {
    setBusyId(batchId);
    setErr('');
    try {
      await cancelKitchenProductionBatch(batchId);
      const res = await fetchKitchenProductionBatches();
      setBatches(res.data ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const maxStaffBatches = Math.max(1, ...staffRows.map((r) => r.batch_count));

  return (
    <PageShell>
      <div>
        <PageHeader
          section="Monitor"
          title="Kitchen Handover"
          subtitle="Production batches, POS receiving, and variance review"
        />
        {err && <ErrorMsg message={err} />}

        <Tabs active={tab} onChange={(id) => setTab(id as TabId)}>
          <TabList>
            {visibleTabs.map((t) => (
              <Tab key={t.id} id={t.id}>{t.label}</Tab>
            ))}
          </TabList>
        </Tabs>

        {loading && <Spinner />}

        {/* ── LIVE ─────────────────────────────────────────────────────────── */}
        {!loading && tab === 'live' && canReports && (
          <div style={{ marginTop: 20, display: 'grid', gap: 20 }}>
            <div
              data-responsive-grid
              style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
            >
              {Object.entries(summary).map(([k, v]) => {
                const meta = SUMMARY_META[k] ?? { label: titleCase(k), accent: 'var(--color-primary)' };
                return (
                  <StatCard
                    key={k}
                    label={meta.label}
                    value={String(v)}
                    sub={meta.sub}
                    accent={meta.accent}
                  />
                );
              })}
            </div>

            <div>
              <SectionTitle>Recent handovers</SectionTitle>
              <TableCard stickyHead>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Batch', 'Order', 'Status', 'Submitted', 'POS received'].map((h) => (
                        <th key={h} style={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {handoverRows.length === 0 ? (
                      <tr>
                        <td colSpan={5}><EmptyState>No handovers yet today.</EmptyState></td>
                      </tr>
                    ) : handoverRows.map((row, i) => (
                      <tr key={String(row.id ?? i)}>
                        <td style={TD}>
                          <strong>{String(row.batch_no ?? '—')}</strong>
                        </td>
                        <td style={TD}>
                          {row.order_id ? (
                            <Link
                              to={`/orders?order=${row.order_id}`}
                              style={{ color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none' }}
                            >
                              {String(row.order_number ?? '—')}
                            </Link>
                          ) : String(row.order_number ?? '—')}
                        </td>
                        <td style={TD}>
                          {statusBadge(String(row.kitchen_handover_status ?? '—'), HANDOVER_STATUS_COLOR)}
                        </td>
                        <td style={{ ...TD, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                          {fmtWhen(row.submitted_at as string | null)}
                        </td>
                        <td style={{ ...TD, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                          {fmtWhen(row.pos_received_at as string | null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </div>
          </div>
        )}

        {/* ── BATCHES ──────────────────────────────────────────────────────── */}
        {!loading && tab === 'batches' && (
          <div style={{ marginTop: 20 }}>
            <SectionTitle>Production batches</SectionTitle>
            {batches.length === 0 ? (
              <EmptyState>No production batches yet.</EmptyState>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {batches.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 14,
                      padding: '16px 18px',
                      boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 16,
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                    }}
                  >
                    <BatchMeta batch={b} />
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {canSubmit && b.status === 'draft' && (
                        <Btn
                          disabled={busyId === b.id}
                          onClick={() => void handleSubmitBatch(b.id)}
                        >
                          {busyId === b.id ? '…' : 'Submit'}
                        </Btn>
                      )}
                      {canManage && !['cancelled', 'received'].includes(b.status) && (
                        <Btn
                          variant="secondary"
                          disabled={busyId === b.id}
                          onClick={() => void handleCancelBatch(b.id)}
                        >
                          Cancel
                        </Btn>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── RECEIVING ────────────────────────────────────────────────────── */}
        {!loading && tab === 'receiving' && (
          <div style={{ marginTop: 20, display: 'grid', gap: 24 }}>
            <div>
              <SectionTitle>
                Pending receive
                <span style={{
                  marginLeft: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--color-text-muted)',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 9999,
                  padding: '2px 8px',
                }}>
                  {pending.length}
                </span>
              </SectionTitle>
              {pending.length === 0 ? (
                <EmptyState>Nothing waiting for POS receive.</EmptyState>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {pending.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 14,
                        padding: '16px 18px',
                        boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 16,
                        flexWrap: 'wrap',
                        alignItems: 'flex-start',
                      }}
                    >
                      <BatchMeta batch={b} />
                      {canReceive && (
                        <Btn
                          disabled={busyId === b.id}
                          onClick={() => void handleReceiveAll(b.id)}
                        >
                          {busyId === b.id ? '…' : 'Receive all'}
                        </Btn>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canReports && (
              <div>
                <SectionTitle>Recent POS receiving</SectionTitle>
                <TableCard stickyHead>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Batch', 'Item', 'Received at'].map((h) => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {receivingRows.length === 0 ? (
                        <tr>
                          <td colSpan={3}><EmptyState>No recent receiving activity.</EmptyState></td>
                        </tr>
                      ) : receivingRows.map((row, i) => (
                        <tr key={i}>
                          <td style={TD}><strong>{String(row.batch_no ?? '—')}</strong></td>
                          <td style={TD}>{String(row.name ?? '—')}</td>
                          <td style={{ ...TD, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                            {fmtWhen(row.received_at as string | null)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableCard>
              </div>
            )}
          </div>
        )}

        {/* ── VARIANCES ────────────────────────────────────────────────────── */}
        {!loading && tab === 'variances' && (
          <div style={{ marginTop: 20 }}>
            <SectionTitle>Open variances</SectionTitle>
            <TableCard stickyHead>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Type', 'Qty', 'Batch', 'Reason', 'Recorded by', ''].map((h) => (
                      <th key={h || 'actions'} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {variances.length === 0 ? (
                    <tr>
                      <td colSpan={6}><EmptyState>No open variances.</EmptyState></td>
                    </tr>
                  ) : variances.map((v) => (
                    <tr key={v.id}>
                      <td style={TD}>
                        <Badge color={VARIANCE_COLOR[v.variance_type] ?? 'gray'}>
                          {titleCase(v.variance_type)}
                        </Badge>
                      </td>
                      <td style={TD}>
                        <strong>{v.qty}</strong>
                        {v.unit ? <span style={{ color: 'var(--color-text-muted)' }}> {v.unit}</span> : null}
                      </td>
                      <td style={TD}>{v.batch_no ?? `#${v.batch_id}`}</td>
                      <td style={{ ...TD, color: 'var(--color-text-secondary)', maxWidth: 240 }}>
                        {v.reason || v.notes || '—'}
                      </td>
                      <td style={{ ...TD, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                        {v.recorded_by?.name ?? '—'}
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <Btn small onClick={() => void handleReview(v.id)}>Review</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          </div>
        )}

        {/* ── WASTE ────────────────────────────────────────────────────────── */}
        {!loading && tab === 'waste' && canReports && (
          <div style={{ marginTop: 20 }}>
            <SectionTitle>Waste & remakes</SectionTitle>
            <TableCard stickyHead>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Type', 'Qty', 'Staff', 'Batch', 'When'].map((h) => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wasteRows.length === 0 ? (
                    <tr>
                      <td colSpan={5}><EmptyState>No waste or remake events.</EmptyState></td>
                    </tr>
                  ) : wasteRows.map((row, i) => (
                    <tr key={String(row.id ?? i)}>
                      <td style={TD}>
                        <Badge color={VARIANCE_COLOR[String(row.type)] ?? 'gray'}>
                          {titleCase(String(row.type ?? '—'))}
                        </Badge>
                      </td>
                      <td style={TD}><strong>{String(row.qty ?? '—')}</strong></td>
                      <td style={TD}>{String(row.staff ?? '—')}</td>
                      <td style={{ ...TD, color: 'var(--color-text-secondary)' }}>
                        {String(row.batch_no ?? '—')}
                      </td>
                      <td style={{ ...TD, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                        {fmtWhen(row.created_at as string | null)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          </div>
        )}

        {/* ── STAFF ────────────────────────────────────────────────────────── */}
        {!loading && tab === 'staff' && canReports && (
          <div style={{ marginTop: 20 }}>
            <SectionTitle>Staff output</SectionTitle>
            {staffRows.length === 0 ? (
              <EmptyState>No staff output for this period.</EmptyState>
            ) : (
              <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 14,
                padding: '8px 4px',
                boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
              }}>
                {staffRows.map((row) => (
                  <div
                    key={row.name}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(120px, 180px) 1fr auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--color-border-light)',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{row.name}</span>
                    <div style={{
                      height: 8,
                      borderRadius: 9999,
                      background: 'var(--color-bg)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.round((row.batch_count / maxStaffBatches) * 100)}%`,
                        height: '100%',
                        background: 'var(--color-primary)',
                        borderRadius: 9999,
                        minWidth: row.batch_count > 0 ? 8 : 0,
                      }} />
                    </div>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--color-text-secondary)',
                      whiteSpace: 'nowrap',
                    }}>
                      {row.batch_count} {row.batch_count === 1 ? 'batch' : 'batches'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS ─────────────────────────────────────────────────────── */}
        {!loading && tab === 'settings' && settings && canManage && (
          <div style={{ marginTop: 20, maxWidth: 640 }}>
            <SectionTitle>Handover settings</SectionTitle>
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
              overflow: 'hidden',
            }}>
              {(Object.keys(SETTINGS_META) as Array<keyof KitchenHandoverSettings>).map((key, idx, arr) => {
                const meta = SETTINGS_META[key];
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 16,
                      padding: '16px 18px',
                      borderBottom: idx < arr.length - 1 ? '1px solid var(--color-border-light)' : 'none',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
                        {meta.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                        {meta.hint}
                      </div>
                    </div>
                    <Toggle
                      checked={Boolean(settings[key])}
                      onChange={(checked) => setSettings((s) => (s ? { ...s, [key]: checked } : s))}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16 }}>
              <Btn onClick={() => void saveSettings()} disabled={settingsBusy}>
                {settingsBusy ? 'Saving…' : 'Save settings'}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
