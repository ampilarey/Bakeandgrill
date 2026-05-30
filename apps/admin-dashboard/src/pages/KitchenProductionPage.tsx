import { useEffect, useState } from 'react';
import { PageHeader } from '../components/SharedUI';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
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
  type KitchenHandoverSettings,
  type KitchenProductionBatch,
  type KitchenVariance,
} from '../api/kitchen-production';

const TABS = [
  { id: 'live', label: 'Live Handover' },
  { id: 'batches', label: 'Production Batches' },
  { id: 'receiving', label: 'POS Receiving' },
  { id: 'variances', label: 'Variances' },
  { id: 'waste', label: 'Waste/Remakes' },
  { id: 'staff', label: 'Staff Output' },
  { id: 'settings', label: 'Settings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function KitchenProductionPage() {
  usePageTitle('Kitchen Handover');
  const { can } = useCurrentUserPermissions();
  const canManage = can('kitchen.production.manage');
  const canReports = can('kitchen.production.reports') || can('kitchen.production.view_all');

  const [tab, setTab] = useState<TabId>('live');
  const [loading, setLoading] = useState(false);
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
        } else if (tab === 'variances' && can('kitchen.variance.review')) {
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
  }, [tab, canReports, canManage, can]);

  const saveSettings = async () => {
    if (!settings) return;
    setSettingsBusy(true);
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

  return (
    <div>
      <PageHeader title="Kitchen Handover" subtitle="Production batches, POS receiving, and variance review" />
      {err && <p style={{ color: '#ef4444', marginBottom: 12 }}>{err}</p>}

      <Tabs active={tab} onChange={(id) => setTab(id as TabId)}>
        <TabList>
          {TABS.map((t) => (
            <Tab key={t.id} id={t.id}>{t.label}</Tab>
          ))}
        </TabList>
      </Tabs>

      {loading && <p style={{ marginTop: 16, color: '#8B7355' }}>Loading…</p>}

      {!loading && tab === 'live' && canReports && (
        <div style={{ marginTop: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {Object.entries(summary).map(([k, v]) => (
            <Card key={k}>
              <p style={{ margin: 0, fontSize: 12, color: '#8B7355' }}>{k.replace(/_/g, ' ')}</p>
              <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800 }}>{v}</p>
            </Card>
          ))}
          <Card style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ marginTop: 0 }}>Recent handovers</h3>
            {handoverRows.length === 0 ? <p>No rows.</p> : (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['batch_no', 'order_number', 'kitchen_handover_status', 'submitted_at', 'pos_received_at'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #EDE4D4' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {handoverRows.map((row, i) => (
                    <tr key={i}>
                      {['batch_no', 'order_number', 'kitchen_handover_status', 'submitted_at', 'pos_received_at'].map((h) => (
                        <td key={h} style={{ padding: 6, borderBottom: '1px solid #F5F0E8' }}>{String(row[h] ?? '—')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {!loading && tab === 'batches' && (
        <Card style={{ marginTop: 16 }}>
          {batches.length === 0 ? <p>No batches.</p> : batches.map((b) => (
            <div key={b.id} style={{ padding: '10px 0', borderBottom: '1px solid #EDE4D4' }}>
              <strong>{b.batch_no}</strong> · {b.production_type} · {b.status}
              {b.order?.order_number ? ` · Order ${b.order.order_number}` : ''}
            </div>
          ))}
        </Card>
      )}

      {!loading && tab === 'receiving' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <Card>
            <h3 style={{ marginTop: 0 }}>Pending receive ({pending.length})</h3>
            {pending.map((b) => (
              <div key={b.id} style={{ marginBottom: 8 }}>{b.batch_no} — {b.status}</div>
            ))}
          </Card>
          {canReports && (
            <Card>
              <h3 style={{ marginTop: 0 }}>Recent POS receiving</h3>
              {receivingRows.map((row, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 6 }}>
                  {String(row.batch_no ?? '')} · {String(row.name ?? '')} · {String(row.received_at ?? '')}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {!loading && tab === 'variances' && (
        <Card style={{ marginTop: 16 }}>
          {variances.length === 0 ? <p>No open variances.</p> : variances.map((v) => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid #EDE4D4' }}>
              <span>{v.variance_type} · {v.qty} {v.unit} · {v.batch_no}</span>
              <Button size="sm" onClick={() => void handleReview(v.id)}>Review</Button>
            </div>
          ))}
        </Card>
      )}

      {!loading && tab === 'waste' && canReports && (
        <Card style={{ marginTop: 16 }}>
          {wasteRows.map((row, i) => (
            <div key={i} style={{ marginBottom: 8, fontSize: 13 }}>
              {String(row.type)} · {String(row.qty)} · {String(row.staff)} · {String(row.created_at)}
            </div>
          ))}
        </Card>
      )}

      {!loading && tab === 'staff' && canReports && (
        <Card style={{ marginTop: 16 }}>
          {staffRows.map((row) => (
            <div key={row.name} style={{ marginBottom: 8 }}>{row.name}: {row.batch_count} batches</div>
          ))}
        </Card>
      )}

      {!loading && tab === 'settings' && settings && canManage && (
        <Card style={{ marginTop: 16, maxWidth: 520 }}>
          {(Object.keys(settings) as Array<keyof KitchenHandoverSettings>).map((key) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, maxWidth: '70%' }}>{key.replace(/kitchen_|_/g, ' ')}</span>
              <Toggle
                checked={settings[key]}
                onChange={(checked) => setSettings((s) => (s ? { ...s, [key]: checked } : s))}
              />
            </div>
          ))}
          <Button onClick={() => void saveSettings()} disabled={settingsBusy}>
            {settingsBusy ? 'Saving…' : 'Save settings'}
          </Button>
        </Card>
      )}
    </div>
  );
}
