import { useEffect, useState } from 'react';
import { getExpenses, getExpenseCategories, storeExpense, deleteExpense, getExpenseSummary, type Expense, type ExpenseCategory } from '../api';
import { Btn, Card, ErrorMsg, PageHeader, Spinner } from '../components/Layout';

function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

export function ExpensesPage() {
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

  // New expense form
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
    await deleteExpense(id);
    void load();
  };

  return (
    <>
      <PageHeader title="Expenses" subtitle="Track operating costs and overheads" />
      {error && <ErrorMsg message={error} />}

      {/* Date range + Add button */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
        <span style={{ color: '#94a3b8' }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
        <Btn onClick={load}>Refresh</Btn>
        <div style={{ marginLeft: 'auto' }}>
          <Btn onClick={() => setShowAdd(true)}>+ Add Expense</Btn>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>

          {/* Expenses table */}
          <div>
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Total Expenses</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#ef4444' }}>MVR {totalAmount.toFixed(2)}</div>
            </Card>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Date', 'Category', 'Description', 'Amount', 'Method', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(exp => (
                    <tr key={exp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{exp.expense_date}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span>{exp.category?.icon} {exp.category?.name}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#1e293b' }}>{exp.description}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>MVR {exp.amount.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{exp.payment_method ?? '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: exp.status === 'approved' ? '#dcfce7' : '#fee2e2',
                          color: exp.status === 'approved' ? '#16a34a' : '#dc2626' }}>
                          {exp.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={() => handleDelete(exp.id)}
                          style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: '#fee2e2', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No expenses in range</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary by category */}
          <div>
            <Card>
              <div style={{ fontWeight: 700, marginBottom: 16, color: '#1e293b' }}>By Category</div>
              {summary?.by_category.map(cat => (
                <div key={cat.category} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                    <span>{cat.icon} {cat.category}</span>
                    <span style={{ fontWeight: 700 }}>MVR {cat.total.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${cat.pct}%`, background: '#f43f5e', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{cat.pct}% · {cat.count} entries</div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card style={{ width: 420 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Add Expense</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Category *
                <select value={form.expense_category_id} onChange={e => setForm(f => ({ ...f, expense_category_id: e.target.value }))}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 4, fontSize: 14 }}>
                  <option value="">Select category</option>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Description *
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 4, fontSize: 14 }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Amount (MVR) *
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 4, fontSize: 14 }} />
                </label>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Date *
                  <input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                    style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 4, fontSize: 14 }} />
                </label>
              </div>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Payment Method
                <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 4, fontSize: 14 }}>
                  {['cash', 'card', 'bank_transfer', 'bml_pay', 'other'].map(m => (
                    <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Notes
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 4, fontSize: 14, resize: 'vertical' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <Btn onClick={handleAdd} disabled={saving || !form.expense_category_id || !form.description || !form.amount}>
                {saving ? 'Saving…' : 'Save Expense'}
              </Btn>
              <button onClick={() => setShowAdd(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
