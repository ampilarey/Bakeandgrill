import { useEffect, useState } from 'react';
import { getInvoices, markInvoiceSent, markInvoicePaid, voidInvoice, type Invoice } from '../api';
import { Btn, Card, ErrorMsg, PageHeader, Spinner } from '../components/Layout';

const STATUS_COLORS: Record<string, string> = {
  draft:     '#64748b',
  sent:      '#0ea5e9',
  paid:      '#22c55e',
  overdue:   '#ef4444',
  cancelled: '#94a3b8',
  void:      '#94a3b8',
};

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [typeFilter, setType]   = useState('');
  const [statusFilter, setStatus] = useState('');
  const [selected, setSelected]   = useState<Invoice | null>(null);
  const [paying, setPaying]       = useState(false);
  const [payMethod, setPayMethod] = useState('cash');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await getInvoices({ type: typeFilter || undefined, status: statusFilter || undefined });
      setInvoices(res.data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [typeFilter, statusFilter]);

  const handleSent = async (id: number) => {
    await markInvoiceSent(id);
    void load();
  };

  const handlePaid = async () => {
    if (!selected) return;
    await markInvoicePaid(selected.id, payMethod);
    setPaying(false); setSelected(null);
    void load();
  };

  const handleVoid = async (id: number) => {
    if (!confirm('Void this invoice?')) return;
    await voidInvoice(id);
    void load();
  };

  return (
    <>
      <PageHeader title="Invoices" subtitle="Manage sale and purchase invoices" />
      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={typeFilter} onChange={e => setType(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}>
          <option value="">All Types</option>
          <option value="sale">Sale</option>
          <option value="purchase">Purchase</option>
          <option value="credit_note">Credit Note</option>
        </select>
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}>
          <option value="">All Statuses</option>
          {['draft', 'sent', 'paid', 'overdue', 'void'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <Btn onClick={load}>Refresh</Btn>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['Number', 'Type', 'Status', 'Recipient', 'Total', 'Issue Date', 'Due Date', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{inv.invoice_number}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569', textTransform: 'uppercase' }}>{inv.type}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: STATUS_COLORS[inv.status] + '22', color: STATUS_COLORS[inv.status] }}>
                      {inv.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{inv.recipient_name ?? inv.customer?.name ?? inv.supplier?.name ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>MVR {inv.total.toFixed(2)}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{inv.issue_date}</td>
                  <td style={{ padding: '10px 12px', color: inv.status === 'overdue' ? '#ef4444' : '#64748b' }}>{inv.due_date ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {inv.status === 'draft' && (
                        <button onClick={() => handleSent(inv.id)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#0ea5e9', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                          Mark Sent
                        </button>
                      )}
                      {['sent', 'overdue'].includes(inv.status) && (
                        <button onClick={() => { setSelected(inv); setPaying(true); }}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                          Mark Paid
                        </button>
                      )}
                      {!['void', 'cancelled'].includes(inv.status) && (
                        <button onClick={() => handleVoid(inv.id)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#fee2e2', color: '#dc2626', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                          Void
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No invoices found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Mark Paid Modal */}
      {paying && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card style={{ width: 360 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Mark Invoice Paid</h3>
            <p style={{ color: '#64748b', marginBottom: 16 }}>{selected.invoice_number} · MVR {selected.total.toFixed(2)}</p>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Payment Method</label>
            <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 20, fontSize: 14 }}>
              {['cash', 'card', 'bml_pay', 'bank_transfer', 'other'].map(m => (
                <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={handlePaid}>Confirm Payment</Btn>
              <button onClick={() => setPaying(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
