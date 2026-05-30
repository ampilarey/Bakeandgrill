import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader, StatCard } from '../components/SharedUI';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tabs, TabList, Tab } from '../components/ui/Tabs';
import {
  getGstSettings, updateGstSettings, getGstSummary, getGstReconciliation,
  getGstOutputStatement, getGstInputStatement, lockGstPeriod,
  downloadGstSummaryCsv, downloadGstOutputXlsx, downloadGstInputXlsx, downloadGstLedgerCsv,
  type GstSettings, type GstSummary,
} from '../api/gst';
import { getInvoices, type Invoice } from '../api/finance';

const mvr = (laar: number) => `MVR ${(laar / 100).toFixed(2)}`;
const mvrFromDecimal = (amount: number) => `MVR ${Number(amount).toFixed(2)}`;

function periodRange(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

export default function GstPage() {
  usePageTitle('GST');
  const [tab, setTab] = useState('Dashboard');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<GstSummary | null>(null);
  const [settings, setSettings] = useState<GstSettings | null>(null);
  const [output, setOutput] = useState<{ tax_invoices: unknown[]; other_transactions: unknown[] } | null>(null);
  const [inputRows, setInputRows] = useState<unknown[]>([]);
  const [warnings, setWarnings] = useState<GstSummary['warnings']>([]);
  const [taxInvoices, setTaxInvoices] = useState<Invoice[]>([]);
  const [creditNotes, setCreditNotes] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getGstSummary(period),
      getGstSettings(),
      getGstReconciliation(period),
    ]).then(([s, st, rec]) => {
      setSummary(s);
      setSettings(st.settings);
      setWarnings(rec.warnings);
    }).finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    if (tab === 'Output GST') {
      getGstOutputStatement(period).then((d) => setOutput(d as typeof output));
    }
    if (tab === 'Input GST') {
      getGstInputStatement(period).then((d) => setInputRows((d as { rows: unknown[] }).rows ?? []));
    }
    if (tab === 'Tax Invoices' || tab === 'Credit Notes') {
      const { from, to } = periodRange(period);
      if (tab === 'Tax Invoices') {
        getInvoices({ type: 'sale', from, to, per_page: 100 }).then((r) => {
          setTaxInvoices(r.data.filter((inv) => inv.is_tax_invoice));
        });
      } else {
        getInvoices({ type: 'credit_note', from, to, per_page: 100 }).then((r) => setCreditNotes(r.data));
      }
    }
  }, [tab, period]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await updateGstSettings(settings);
      setSettings(res.settings);
      setMessage('GST settings saved.');
    } catch {
      setMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const tabs = ['Dashboard', 'Output GST', 'Input GST', 'Tax Invoices', 'Credit Notes', 'Reconciliation', 'Settings'];

  return (
    <div>
      <PageHeader
        title="GST Reporting"
        subtitle="Maldives MIRA-ready GST — General Sector 8% (800 bp). Tourism rates apply only if a tourism taxable activity is configured."
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#6B5D4F' }}>
          Period{' '}
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #E8DDD0' }} />
        </label>
        {summary?.locked && <span style={{ color: '#B45309', fontSize: 13, fontWeight: 600 }}>Period locked</span>}
      </div>

      <Tabs active={tab} onChange={setTab}>
        <TabList>
          {tabs.map((t) => <Tab key={t} id={t}>{t}</Tab>)}
        </TabList>
      </Tabs>

      {message && <p style={{ color: '#059669', margin: '12px 0' }}>{message}</p>}

      {loading && tab === 'Dashboard' && <p>Loading…</p>}

      {!loading && tab === 'Dashboard' && summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
            <StatCard label="Net GST payable" value={mvr(summary.net_gst_payable_laar)} accent="#D4813A" />
            <StatCard label="Output tax" value={mvr(summary.gst_on_standard_sales_laar)} accent="#8B4513" />
            <StatCard label="Input tax (claimable)" value={mvr(summary.claimable_input_revenue_laar + summary.claimable_input_capital_laar)} accent="#059669" />
            <StatCard label="Sales ex-GST" value={mvr(summary.standard_rated_sales_ex_gst_laar)} accent="#6B5D4F" />
            <StatCard label="Credit notes / refunds" value={mvr(Math.abs(summary.credit_note_refund_adjustments_laar))} accent="#DC2626" />
          </div>

          {warnings.length > 0 && (
            <div style={{ marginTop: 16 }}>
            <Card className="border-[#FCD34D]">
              <strong>Warnings ({warnings.length})</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13 }}>
                {warnings.slice(0, 8).map((w, i) => <li key={i}>{w.message}</li>)}
              </ul>
            </Card>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <Button onClick={() => downloadGstSummaryCsv(period)}>Export summary CSV</Button>
            <Button onClick={() => downloadGstOutputXlsx(period)}>Output Tax Statement (XLSX)</Button>
            <Button onClick={() => downloadGstInputXlsx(period)}>Input Tax Statement (XLSX)</Button>
            <Button onClick={() => downloadGstLedgerCsv(period)}>Ledger CSV</Button>
            {!summary.locked && (
              <Button variant="secondary" onClick={async () => { await lockGstPeriod(period); setMessage('Period locked.'); }}>
                Lock period
              </Button>
            )}
          </div>

          <p style={{ fontSize: 12, color: '#9C8E7E', marginTop: 12, maxWidth: 720 }}>
            Output Tax Statement export is mandatory only when MIRA requires it — for example when annual total income for the previous tax year&apos;s taxable periods reaches the MIRA threshold.
            Input Tax Statement export is required whenever you claim input tax.
          </p>
        </>
      )}

      {tab === 'Output GST' && output && (
        <Card style={{ marginTop: 16, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Tax Invoices ({output.tax_invoices?.length ?? 0})</h3>
          <p style={{ fontSize: 13, color: '#6B5D4F' }}>GST-registered customers with issued tax invoices.</p>
          <h3>Other Transactions</h3>
          <p style={{ fontSize: 13 }}>POS / walk-in / cash / card / BML sales not in TaxInvoices sheet.</p>
          <pre style={{ fontSize: 11, overflow: 'auto', background: '#FAF7F2', padding: 12, borderRadius: 8 }}>
            {JSON.stringify(output, null, 2)}
          </pre>
        </Card>
      )}

      {tab === 'Input GST' && (
        <Card style={{ marginTop: 16, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Claimable input tax ({inputRows.length} rows)</h3>
          <pre style={{ fontSize: 11, overflow: 'auto', background: '#FAF7F2', padding: 12, borderRadius: 8 }}>
            {JSON.stringify(inputRows, null, 2)}
          </pre>
        </Card>
      )}

      {tab === 'Tax Invoices' && (
        <Card style={{ marginTop: 16, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Tax invoices ({taxInvoices.length})</h3>
          <p style={{ fontSize: 13, color: '#6B5D4F' }}>B2B tax invoices issued in {period}. Create more from Finance → Invoices or from an order.</p>
          {taxInvoices.length === 0 ? (
            <p style={{ color: '#9C8E7E' }}>No tax invoices in this period.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E8DDD0', textAlign: 'left' }}>
                  {['Number', 'Customer TIN', 'Recipient', 'Date', 'Total', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '8px 6px', color: '#6B5D4F' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {taxInvoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #F0EBE5' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ padding: '8px 6px' }}>{inv.customer_tin ?? '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{inv.recipient_name ?? inv.customer?.name ?? '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{inv.issue_date}</td>
                    <td style={{ padding: '8px 6px' }}>{mvrFromDecimal(inv.total)}</td>
                    <td style={{ padding: '8px 6px' }}>{inv.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'Credit Notes' && (
        <Card style={{ marginTop: 16, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Credit notes ({creditNotes.length})</h3>
          {creditNotes.length === 0 ? (
            <p style={{ color: '#9C8E7E' }}>No credit notes in this period.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E8DDD0', textAlign: 'left' }}>
                  {['Number', 'Date', 'Total', 'Reason', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '8px 6px', color: '#6B5D4F' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creditNotes.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #F0EBE5' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ padding: '8px 6px' }}>{inv.issue_date}</td>
                    <td style={{ padding: '8px 6px' }}>{mvrFromDecimal(inv.total)}</td>
                    <td style={{ padding: '8px 6px' }}>{inv.credit_note_reason ?? inv.notes ?? '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{inv.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'Reconciliation' && (
        <Card style={{ marginTop: 16, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Reconciliation warnings</h3>
          {warnings.length === 0 ? <p>No warnings for this period.</p> : (
            <ul>{warnings.map((w, i) => <li key={i} style={{ marginBottom: 8 }}><strong>{w.type}</strong>: {w.message}</li>)}</ul>
          )}
        </Card>
      )}

      {tab === 'Settings' && settings && (
        <Card style={{ marginTop: 16, padding: 16, maxWidth: 640 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input type="checkbox" checked={settings.gst_registered} onChange={(e) => setSettings({ ...settings, gst_registered: e.target.checked })} />
            GST registered with MIRA
          </label>
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              ['seller_name', 'Seller name'],
              ['seller_tin', 'TIN'],
              ['taxable_activity_no', 'Taxable activity no.'],
              ['seller_address', 'Seller address'],
            ].map(([key, label]) => (
              <label key={key} style={{ fontSize: 13 }}>
                {label}
                <input
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #E8DDD0' }}
                  value={String((settings as unknown as Record<string, string | null | boolean | number>)[key] ?? '')}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                />
              </label>
            ))}
            <label style={{ fontSize: 13 }}>
              Accounting basis
              <select
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                value={settings.accounting_basis}
                onChange={(e) => setSettings({ ...settings, accounting_basis: e.target.value as GstSettings['accounting_basis'] })}
              >
                <option value="invoice">Invoice basis (Maldives GST Act legal default)</option>
                <option value="payment">Payment basis</option>
                <option value="hybrid">Hybrid — POS on payment, B2B tax invoices on issue date</option>
              </select>
              <span style={{ fontSize: 11, color: '#9C8E7E' }}>{settings.legal_default_note}</span>
            </label>
            <label style={{ fontSize: 13 }}>
              GST rate (basis points)
              <input type="number" value={settings.default_tax_rate_bp} onChange={(e) => setSettings({ ...settings, default_tax_rate_bp: parseInt(e.target.value, 10) || 800 })} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }} />
              <span style={{ fontSize: 11, color: '#9C8E7E' }}>Bake &amp; Grill General Sector: 800 bp (8%). Tourism sector was 16% (1 Jan 2023–30 Jun 2025) and 17% from 1 Jul 2025 — not used unless a tourism activity is added.</span>
            </label>
            <label style={{ fontSize: 13 }}>
              Taxable period
              <select value={settings.taxable_period} onChange={(e) => setSettings({ ...settings, taxable_period: e.target.value as 'monthly' | 'quarterly' })} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={settings.tax_inclusive} onChange={(e) => setSettings({ ...settings, tax_inclusive: e.target.checked })} />
              Tax-inclusive pricing
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={settings.lock_after_export} onChange={(e) => setSettings({ ...settings, lock_after_export: e.target.checked })} />
              Lock period after export
            </label>
          </div>
          <Button onClick={saveSettings} disabled={saving} style={{ marginTop: 16 }}>{saving ? 'Saving…' : 'Save settings'}</Button>
        </Card>
      )}
    </div>
  );
}
