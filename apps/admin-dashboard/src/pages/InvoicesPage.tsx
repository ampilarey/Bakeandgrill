import { useEffect, useState } from 'react';
import { getInvoices, markInvoiceSent, markInvoicePaid, voidInvoice, type Invoice } from '../api';
import { Badge, Btn, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, Spinner, TableCard, TD, TH, statColor } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

const TYPE_COLOR: Record<string, string> = { sale: 'teal', purchase: 'blue', credit_note: 'orange' };

export function InvoicesPage() {
  usePageTitle('Invoices');
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [typeFilter, setType]       = useState('');
  const [statusFilter, setStatus]   = useState('');
  const [selected, setSelected]     = useState<Invoice | null>(null);
  const [paying, setPaying]         = useState(false);
  const [payMethod, setPayMethod]   = useState('cash');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await getInvoices({ type: typeFilter || undefined, status: statusFilter || undefined });
      setInvoices(res.data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [typeFilter, statusFilter]);

  const handleSent = async (id: number) => { await markInvoiceSent(id); void load(); };
  const handlePaid = async () => {
    if (!selected) return;
    await markInvoicePaid(selected.id, payMethod);
    setPaying(false); setSelected(null); void load();
  };
  const handleVoid = async (id: number) => {
    if (!confirm('Void this invoice?')) return;
    await voidInvoice(id); void load();
  };

  const selectStyle = {
    height: 36, padding: '0 10px',
    border: '1.5px solid #E8E0D8', borderRadius: 10,
    fontSize: 13, fontFamily: 'inherit',
    background: '#fff', color: '#1C1408', outline: 'none', cursor: 'pointer',
  };

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Manage sale and purchase invoices"
        action={<Btn onClick={load} variant="secondary">↻ Refresh</Btn>}
      />
      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={typeFilter} onChange={(e) => setType(e.target.value)} style={selectStyle}>
          <option value="">All Types</option>
          <option value="sale">Sale</option>
          <option value="purchase">Purchase</option>
          <option value="credit_note">Credit Note</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          {['draft', 'sent', 'paid', 'overdue', 'void'].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {loading ? <Spinner /> : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['Number', 'Type', 'Status', 'Recipient', 'Total', 'Issue Date', 'Due', 'Actions'].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ ...TD, fontWeight: 700, color: '#1C1408' }}>{inv.invoice_number}</td>
                  <td style={TD}>
                    <Badge label={inv.type.replace('_', ' ')} color={TYPE_COLOR[inv.type] ?? 'gray'} />
                  </td>
                  <td style={TD}>
                    <Badge label={inv.status} color={statColor(inv.status)} />
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{inv.recipient_name ?? inv.customer?.name ?? inv.supplier?.name ?? '—'}</td>
                  <td style={{ ...TD, fontWeight: 700, color: '#D4813A' }}>MVR {inv.total.toFixed(2)}</td>
                  <td style={{ ...TD, color: '#9C8E7E', whiteSpace: 'nowrap' }}>{inv.issue_date}</td>
                  <td style={{ ...TD, color: inv.status === 'overdue' ? '#ef4444' : '#9C8E7E', whiteSpace: 'nowrap' }}>
                    {inv.due_date ?? '—'}
                  </td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {inv.status === 'draft' && (
                        <Btn small variant="secondary" onClick={() => handleSent(inv.id)}>Mark Sent</Btn>
                      )}
                      {['sent', 'overdue'].includes(inv.status) && (
                        <Btn small onClick={() => { setSelected(inv); setPaying(true); }}>Mark Paid</Btn>
                      )}
                      {!['void', 'cancelled'].includes(inv.status) && (
                        <Btn small variant="danger" onClick={() => handleVoid(inv.id)}>Void</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState message="No invoices found." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableCard>
      )}

      {/* Mark Paid Modal */}
      {paying && selected && (
        <Modal title="Mark Invoice Paid" onClose={() => { setPaying(false); setSelected(null); }} maxWidth={380}>
          <p style={{ color: '#6B5D4F', fontSize: 14, marginBottom: 20 }}>
            {selected.invoice_number} · <strong style={{ color: '#D4813A' }}>MVR {selected.total.toFixed(2)}</strong>
          </p>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Payment Method</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', outline: 'none' }}
            >
              {['cash', 'card', 'bml_pay', 'bank_transfer', 'other'].map((m) => (
                <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>
              ))}
            </select>
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => { setPaying(false); setSelected(null); }}>Cancel</Btn>
            <Btn onClick={handlePaid}>Confirm Payment</Btn>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
