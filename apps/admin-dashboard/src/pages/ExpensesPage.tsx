import { useEffect, useState } from 'react';
import { getExpenses, getExpenseCategories, storeExpense, deleteExpense, getExpenseSummary, type Expense, type ExpenseCategory } from '../api';
import { Badge, Btn, Card, DateInput, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, Spinner, StatCard, TableCard, TD, TH } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

const STATUS_COLOR: Record<string, string> = { approved: 'green', pending: 'yellow', rejected: 'red' };

export function ExpensesPage() {
  usePageTitle('Expenses');
  const [expenses, setExpenses]   = useState<Expense[]>([]);
  const [cats, setCats]           = useState<ExpenseCategory[]>([]);
  const [summary, setSummary]     = useState<{ total: number; by_category: { category: string; icon: string; total: number; count: number; pct: number }[] } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [totalAmount, setTotal]   = useState(0);
  const [from, setFrom]           = useState(monthStart());
  const [to, setTo]               = useState(today());
  const [showAdd, setShowAdd]     = useState(false);
  const [saving, setSaving]       = useState(false);

  const [form, setForm] = useState({
    expense_category_id: '',
    description: '',
    amount: '',
    expense_date: today(),
    payment_method: 'cash',
    notes: '',
  });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [expRes, catRes, sumRes] = await Promise.all([
        getExpenses({ from, to }),
        getExpenseCategories(),
        getExpenseSummary(from, to),
      ]);
      setExpenses(expRes.data);
      setTotal(expRes.total_amount);
      setCats(catRes.categories);
      setSummary(sumRes);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [from, to]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await storeExpense({ ...form, expense_category_id: parseInt(form.expense_category_id), amount: parseFloat(form.amount) });
      setShowAdd(false);
      setForm({ expense_category_id: '', description: '', amount: '', expense_date: today(), payment_method: 'cash', notes: '' });
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await deleteExpense(id);
      void load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const fieldStyle = {
    width: '100%', height: 36, padding: '0 10px',
    border: '1.5px solid #E8E0D8', borderRadius: 10,
    fontSize: 13, fontFamily: 'inherit', background: '#fff',
    color: '#1C1408', outline: 'none', boxSizing: 'border-box' as const,
  };

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Track operating costs and overheads"
        action={<Btn onClick={() => setShowAdd(true)}>+ Add Expense</Btn>}
      />
      {error && <ErrorMsg message={error} />}

      {/* Date range */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <Btn variant="secondary" onClick={load}>Apply</Btn>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(260px,1fr)', gap: 20 }}>

          {/* Left: total + table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <StatCard label="Total Expenses" value={`MVR ${parseFloat(String(totalAmount ?? 0)).toFixed(2)}`} accent="#ef4444" />

            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    {['Date', 'Category', 'Description', 'Amount', 'Method', 'Status', ''].map((h) => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr key={exp.id}>
                      <td style={{ ...TD, whiteSpace: 'nowrap', color: '#9C8E7E' }}>{exp.expense_date}</td>
                      <td style={TD}>{exp.category?.icon} {exp.category?.name}</td>
                      <td style={{ ...TD, color: '#1C1408' }}>{exp.description}</td>
                      <td style={{ ...TD, fontWeight: 700, color: '#D4813A', whiteSpace: 'nowrap' }}>MVR {parseFloat(String(exp.amount ?? 0)).toFixed(2)}</td>
                      <td style={{ ...TD, color: '#6B5D4F' }}>{exp.payment_method?.replace('_', ' ') ?? '—'}</td>
                      <td style={TD}>
                        <Badge label={exp.status} color={STATUS_COLOR[exp.status] ?? 'gray'} />
                      </td>
                      <td style={TD}>
                        <Btn small variant="danger" onClick={() => handleDelete(exp.id)}>Delete</Btn>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr><td colSpan={7}><EmptyState message="No expenses in this date range." /></td></tr>
                  )}
                </tbody>
              </table>
            </TableCard>
          </div>

          {/* Right: by category */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', marginBottom: 20, margin: '0 0 20px' }}>By Category</p>
            {summary?.by_category.length === 0 && (
              <p style={{ color: '#9C8E7E', fontSize: 13 }}>No data for this period.</p>
            )}
            {summary?.by_category.map((cat) => (
              <div key={cat.category} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: '#1C1408', fontWeight: 600 }}>{cat.icon} {cat.category}</span>
                  <span style={{ fontWeight: 700, color: '#D4813A' }}>MVR {parseFloat(String(cat.total ?? 0)).toFixed(2)}</span>
                </div>
                <div style={{ height: 6, background: '#F0EBE5', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${cat.pct}%`, background: '#D4813A', borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: '#9C8E7E', marginTop: 3 }}>{cat.pct}% · {cat.count} entries</div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAdd && (
        <Modal title="Add Expense" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Category *
              <select
                value={form.expense_category_id}
                onChange={(e) => setForm((f) => ({ ...f, expense_category_id: e.target.value }))}
                style={{ ...fieldStyle, marginTop: 4 }}
              >
                <option value="">Select category</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Description *
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                style={{ ...fieldStyle, marginTop: 4 }}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
                Amount (MVR) *
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  style={{ ...fieldStyle, marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
                Date *
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                  style={{ ...fieldStyle, marginTop: 4 }}
                />
              </label>
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Payment Method
              <select
                value={form.payment_method}
                onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                style={{ ...fieldStyle, marginTop: 4 }}
              >
                {['cash', 'card', 'bank_transfer', 'bml_pay', 'other'].map((m) => (
                  <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                style={{ ...fieldStyle, height: 'auto', padding: '8px 10px', resize: 'vertical', marginTop: 4 }}
              />
            </label>
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
            <Btn
              onClick={handleAdd}
              disabled={saving || !form.expense_category_id || !form.description || !form.amount}
            >
              {saving ? 'Saving…' : 'Save Expense'}
            </Btn>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
