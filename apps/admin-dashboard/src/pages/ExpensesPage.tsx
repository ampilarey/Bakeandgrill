import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getExpenses, getExpense, getExpenseCategories, storeExpense, updateExpense, deleteExpense, getExpenseSummary,
  uploadExpenseReceipt, approveExpense, pushExpenseToXero,
  getPurchaseAutoExpenseSettings, updatePurchaseAutoExpenseSettings,
  type Expense, type ExpenseCategory,
} from '../api';
import { Toggle } from '../components/ui';
import { downloadCSV } from '../utils/csvExport';
import { today, monthStart } from '../utils/dateHelpers';
import { ADMIN_EXPENSE_PAYMENT_METHODS, paymentMethodLabel } from '../lib/paymentMethods';
import { Badge, Btn, Card, ConfirmDialog, DateInput, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, Spinner, StatCard, TableCard, TD, TH, useConfirmDialog } from '../components/Layout';
import { PurchaseSearch, type PurchaseSearchSelection } from '../components/PurchaseSearch';
import { usePageTitle } from '../hooks/usePageTitle';

const STATUS_COLOR: Record<string, string> = { approved: 'green', pending: 'yellow', rejected: 'red' };

const emptyForm = {
  expense_category_id: '', description: '', amount: '', expense_date: today(), payment_method: 'cash', notes: '',
  is_input_tax_claimable: false,
  supplier_tin: '', supplier_invoice_no: '', supplier_invoice_date: '',
  amount_ex_gst: '', gst_amount: '', revenue_or_capital: 'revenue' as 'revenue' | 'capital',
};

function laarFromMvr(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

function gstExpensePayload(form: typeof emptyForm) {
  return {
    is_input_tax_claimable: form.is_input_tax_claimable,
    supplier_tin: form.supplier_tin || undefined,
    supplier_invoice_no: form.supplier_invoice_no || undefined,
    supplier_invoice_date: form.supplier_invoice_date || undefined,
    amount_excluding_gst_laar: laarFromMvr(form.amount_ex_gst),
    gst_laar: laarFromMvr(form.gst_amount),
    gst_rate_bp: form.gst_amount ? 800 : undefined,
    revenue_or_capital: form.revenue_or_capital,
  };
}

function GstExpenseFields({ form, setForm, fieldStyle }: {
  form: typeof emptyForm;
  setForm: Dispatch<SetStateAction<typeof emptyForm>>;
  fieldStyle: CSSProperties;
}) {
  return (
    <div style={{ borderTop: '1px solid #E8DDD0', paddingTop: 12, marginTop: 4 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', margin: '0 0 10px' }}>Input GST (optional)</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10 }}>
        <input type="checkbox" checked={form.is_input_tax_claimable} onChange={(e) => setForm((f) => ({ ...f, is_input_tax_claimable: e.target.checked }))} />
        Claimable input tax
      </label>
      {form.is_input_tax_claimable && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
            Supplier TIN *
            <input value={form.supplier_tin} onChange={(e) => setForm((f) => ({ ...f, supplier_tin: e.target.value }))} style={{ ...fieldStyle, marginTop: 4 }} />
          </label>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Supplier invoice no. *
              <input value={form.supplier_invoice_no} onChange={(e) => setForm((f) => ({ ...f, supplier_invoice_no: e.target.value }))} style={{ ...fieldStyle, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Invoice date *
              <input type="date" value={form.supplier_invoice_date} onChange={(e) => setForm((f) => ({ ...f, supplier_invoice_date: e.target.value }))} style={{ ...fieldStyle, marginTop: 4 }} />
            </label>
          </div>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Amount ex-GST (MVR)
              <input type="number" value={form.amount_ex_gst} onChange={(e) => setForm((f) => ({ ...f, amount_ex_gst: e.target.value }))} style={{ ...fieldStyle, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              GST amount (MVR, 8%)
              <input type="number" value={form.gst_amount} onChange={(e) => setForm((f) => ({ ...f, gst_amount: e.target.value }))} style={{ ...fieldStyle, marginTop: 4 }} />
            </label>
          </div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
            Revenue or capital
            <select value={form.revenue_or_capital} onChange={(e) => setForm((f) => ({ ...f, revenue_or_capital: e.target.value as 'revenue' | 'capital' }))} style={{ ...fieldStyle, marginTop: 4 }}>
              <option value="revenue">Revenue expense</option>
              <option value="capital">Capital expense</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

export function ExpensesPage() {
  usePageTitle('Expenses');
  const [searchParams, setSearchParams] = useSearchParams();
  const [expenses, setExpenses]   = useState<Expense[]>([]);
  const [cats, setCats]           = useState<ExpenseCategory[]>([]);
  const [summary, setSummary]     = useState<{ total: number; by_category: { category: string; icon: string; total: number; count: number; pct: number }[] } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [totalAmount, setTotal]   = useState(0);
  const [from, setFrom]           = useState(monthStart());
  const [to, setTo]               = useState(today());
  const [search, setSearch]       = useState(() => searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => (searchParams.get('search') ?? '').trim());
  const autoOpenedFor = useRef<string | null>(null);
  const openedExpenseId = useRef<string | null>(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [saving, setSaving]       = useState(false);
  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();

  const [form, setForm] = useState(emptyForm);
  const [linkedPurchase, setLinkedPurchase] = useState<PurchaseSearchSelection | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptExpenseId, setReceiptExpenseId] = useState<number | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [autoNonStock, setAutoNonStock] = useState(false);
  const [autoNonStockSaving, setAutoNonStockSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const toggleBulk = (id: number) => setBulkSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllBulk = () => {
    if (bulkSelected.size === expenses.length) setBulkSelected(new Set());
    else setBulkSelected(new Set(expenses.map((e) => e.id)));
  };
  const bulkApprove = async () => {
    const pending = expenses.filter((e) => bulkSelected.has(e.id) && e.status === 'pending');
    if (!pending.length) { showToast('No pending expenses selected.'); return; }
    setBulkLoading(true);
    try {
      await Promise.all(pending.map((e) => approveExpense(e.id)));
      showToast(`${pending.length} expense${pending.length !== 1 ? 's' : ''} approved.`);
      setBulkSelected(new Set()); void load();
    } catch (e) { setError((e as Error).message); }
    finally { setBulkLoading(false); }
  };

  const handleEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setForm({
      expense_category_id: String(exp.category?.id ?? ''),
      description: exp.description ?? '',
      amount: String(exp.amount ?? ''),
      expense_date: exp.expense_date ?? today(),
      payment_method: exp.payment_method ?? 'cash',
      notes: exp.notes ?? '',
      is_input_tax_claimable: !!exp.is_input_tax_claimable,
      supplier_tin: exp.supplier_tin ?? '',
      supplier_invoice_no: exp.supplier_invoice_no ?? '',
      supplier_invoice_date: exp.supplier_invoice_date ?? '',
      amount_ex_gst: exp.amount_excluding_gst_laar != null ? String(exp.amount_excluding_gst_laar / 100) : '',
      gst_amount: exp.gst_laar != null ? String(exp.gst_laar / 100) : '',
      revenue_or_capital: (exp.revenue_or_capital as 'revenue' | 'capital') ?? 'revenue',
    });
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const fromUrl = searchParams.get('search') ?? '';
    if (fromUrl === debouncedSearch) return;
    setSearch(fromUrl);
    setDebouncedSearch(fromUrl.trim());
    autoOpenedFor.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const current = searchParams.get('search') ?? '';
    if (debouncedSearch === current) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('search', debouncedSearch);
    else next.delete('search');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, setSearchParams]);

  useEffect(() => {
    const expenseId = searchParams.get('expense');
    if (!expenseId || openedExpenseId.current === expenseId) return;
    openedExpenseId.current = expenseId;
    const id = Number(expenseId);
    if (!Number.isFinite(id)) return;
    void getExpense(id)
      .then((res) => {
        if (res.expense && !res.expense.is_auto) handleEdit(res.expense);
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      // When searching (esp. deep links), skip date range so the expense is findable
      const dateParams = debouncedSearch ? {} : { from, to };
      const [expRes, catRes, sumRes] = await Promise.all([
        getExpenses({ ...dateParams, search: debouncedSearch || undefined }),
        getExpenseCategories(),
        getExpenseSummary(from, to),
      ]);
      const list = expRes.data ?? [];
      setExpenses(list);
      setTotal(expRes.total_amount);
      setCats(catRes.categories ?? []);
      setSummary(sumRes);
      if (debouncedSearch && autoOpenedFor.current !== debouncedSearch) {
        const needle = debouncedSearch.toLowerCase();
        const match = list.find((e) => (e.expense_number ?? '').toLowerCase() === needle)
          ?? (list.length === 1 ? list[0] : null);
        if (match && !match.is_auto) {
          handleEdit(match);
          autoOpenedFor.current = debouncedSearch;
        } else if (match) {
          autoOpenedFor.current = debouncedSearch;
        }
      }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [from, to, debouncedSearch]);

  useEffect(() => {
    void getPurchaseAutoExpenseSettings()
      .then((res) => setAutoNonStock(!!res.settings?.auto_expense_non_stock_purchases))
      .catch(() => { /* optional setting — ignore if unavailable */ });
  }, []);

  const handleAutoNonStockToggle = async (checked: boolean) => {
    setAutoNonStockSaving(true);
    setError('');
    try {
      const res = await updatePurchaseAutoExpenseSettings({ auto_expense_non_stock_purchases: checked });
      setAutoNonStock(!!res.settings.auto_expense_non_stock_purchases);
      showToast(checked
        ? 'Auto-expense for non-stock PO lines is ON (pending approval).'
        : 'Auto-expense for non-stock PO lines is OFF.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAutoNonStockSaving(false);
    }
  };

  const handleAdd = async () => {
    const catId  = parseInt(form.expense_category_id, 10);
    const amount = parseFloat(form.amount);
    if (isNaN(catId) || isNaN(amount) || amount <= 0) {
      setError('Please select a category and enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await storeExpense({
        ...form,
        expense_category_id: catId,
        amount,
        ...gstExpensePayload(form),
        purchase_id: linkedPurchase?.id,
      });
      setShowAdd(false);
      setForm(emptyForm);
      setLinkedPurchase(null);
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editingExpense) return;
    const catId  = parseInt(form.expense_category_id, 10);
    const amount = parseFloat(form.amount);
    if (isNaN(catId) || isNaN(amount) || amount <= 0) {
      setError('Please select a category and enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await updateExpense(editingExpense.id, { ...form, expense_category_id: catId, amount, ...gstExpensePayload(form) });
      setEditingExpense(null);
      setForm(emptyForm);
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = (id: number) => {
    ask({
      title: 'Delete Expense',
      message: 'Delete this expense record? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteExpense(id);
          void load();
        } catch (e) {
          setError((e as Error).message);
        }
      },
    });
  };

  const handleApprove = async (exp: Expense) => {
    setActionLoading(exp.id);
    try {
      const { expense } = await approveExpense(exp.id);
      setExpenses((prev) => prev.map((e) => e.id === exp.id ? expense : e));
      showToast('Expense approved.');
    } catch (e) { setError((e as Error).message); }
    finally { setActionLoading(null); }
  };

  const handlePushXero = async (exp: Expense) => {
    setActionLoading(exp.id);
    try {
      await pushExpenseToXero(exp.id);
      showToast('Expense pushed to Xero.');
    } catch (e) { setError((e as Error).message); }
    finally { setActionLoading(null); }
  };

  const triggerReceiptUpload = (id: number) => {
    setReceiptExpenseId(id);
    fileInputRef.current?.click();
  };

  const handleReceiptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || receiptExpenseId === null) return;
    e.target.value = '';
    setActionLoading(receiptExpenseId);
    try {
      const { expense } = await uploadExpenseReceipt(receiptExpenseId, file);
      setExpenses((prev) => prev.map((ex) => ex.id === expense.id ? expense : ex));
      showToast('Receipt uploaded.');
    } catch (err) { setError((err as Error).message); }
    finally { setActionLoading(null); setReceiptExpenseId(null); }
  };

  const fieldStyle = {
    width: '100%', height: 36, padding: '0 10px',
    border: '1.5px solid #E8E0D8', borderRadius: 10,
    fontSize: 13, fontFamily: 'inherit', background: '#fff',
    color: '#1C1408', outline: 'none', boxSizing: 'border-box' as const,
  };

  return (
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleReceiptFile} />
      <PageHeader
        title="Expenses"
        subtitle="Track operating costs and overheads"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => downloadCSV('expenses', expenses.map((e) => ({ Date: e.expense_date, Category: e.category?.name ?? '', Description: e.description, 'Amount (MVR)': Number(e.amount ?? 0).toFixed(2), PO: e.purchase?.purchase_number ?? '', Method: paymentMethodLabel(e.payment_method), Status: e.status, Notes: e.notes ?? '' })))}>Export CSV</Btn>
            <Btn onClick={() => { setLinkedPurchase(null); setShowAdd(true); }}>+ Add Expense</Btn>
          </div>
        }
      />
      <p style={{ fontSize: 13, color: '#6B5D4F', margin: '0 0 12px', lineHeight: 1.45 }}>
        Use Expenses for non-stock operating costs (utilities, rent, packaging, services). Stock purchases belong in{' '}
        <Link to="/purchase-orders" style={{ color: '#D4813A', fontWeight: 600 }}>Purchase Orders</Link>
        {' '}so they flow into inventory and COGS — linking a PO here is optional reference only, not a second cost entry.
        {' '}See{' '}
        <Link to="/reports?tab=Spend%20Hub" style={{ color: '#D4813A', fontWeight: 600 }}>Reports → Spend Hub</Link>
        {' '}for purchases + expenses together.
      </p>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        background: '#F8F6F3', border: '1px solid #E8E0D8', borderRadius: 12, padding: '12px 14px', marginBottom: 16,
      }}>
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1408' }}>Auto-expense non-stock PO lines</div>
          <div style={{ fontSize: 12, color: '#6B5D4F', marginTop: 4, lineHeight: 1.4 }}>
            Off by default. When on, receiving PO lines without an inventory item creates a pending expense
            linked to that PO. Stock/inventory lines are never auto-expensed.
          </div>
        </div>
        <Toggle
          checked={autoNonStock}
          disabled={autoNonStockSaving}
          onChange={handleAutoNonStockToggle}
          label={autoNonStock ? 'On' : 'Off'}
        />
      </div>
      {toast && (
        <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {toast}
        </div>
      )}
      {error && <ErrorMsg message={error} />}

      {/* Date range */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search expense #, description…"
          style={{
            height: 36, minWidth: 220, padding: '0 12px',
            border: '1.5px solid #E8E0D8', borderRadius: 10,
            fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#1C1408', outline: 'none',
          }}
        />
        {debouncedSearch && (
          <span style={{ fontSize: 12, color: '#9C8E7E' }}>Date range paused while searching</span>
        )}
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(260px,1fr)', gap: 20 }}>

          {/* Left: total + table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <StatCard label="Total Expenses" value={`MVR ${parseFloat(String(totalAmount ?? 0)).toFixed(2)}`} accent="#ef4444" />

            {bulkSelected.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, marginBottom: 10, background: '#1C1408', color: '#fff' }}>
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{bulkSelected.size} selected</span>
                <Btn small onClick={bulkApprove} disabled={bulkLoading}>✓ Approve</Btn>
                <button onClick={() => setBulkSelected(new Set())} style={{ background: 'none', border: 'none', color: '#C4B5A3', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
            )}
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, width: 36 }}>
                      <input type="checkbox" checked={bulkSelected.size === expenses.length && expenses.length > 0} onChange={toggleAllBulk} style={{ cursor: 'pointer' }} />
                    </th>
                    {['Number', 'Date', 'Category', 'Description', 'Amount', 'PO', 'Method', 'Status', ''].map((h) => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr key={exp.id} style={{ background: bulkSelected.has(exp.id) ? '#FEF8F2' : undefined }}>
                      <td style={{ ...TD, width: 36 }}><input type="checkbox" checked={bulkSelected.has(exp.id)} onChange={() => toggleBulk(exp.id)} style={{ cursor: 'pointer' }} /></td>
                      <td style={{ ...TD, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: '#1C1408', whiteSpace: 'nowrap' }}>
                        {exp.expense_number ?? '—'}
                      </td>
                      <td style={{ ...TD, whiteSpace: 'nowrap', color: '#9C8E7E' }}>{exp.expense_date}</td>
                      <td style={TD}>{exp.category?.icon} {exp.category?.name}</td>
                      <td style={{ ...TD, color: '#1C1408' }}>
                        {exp.description}
                        {exp.is_auto && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '2px 6px', borderRadius: 4 }}>AUTO</span>
                        )}
                      </td>
                      <td style={{ ...TD, fontWeight: 700, color: '#D4813A', whiteSpace: 'nowrap' }}>MVR {parseFloat(String(exp.amount ?? 0)).toFixed(2)}</td>
                      <td style={TD}>
                        {exp.purchase?.purchase_number || exp.purchase_id ? (
                          <Link
                            to={`/purchase-orders?search=${encodeURIComponent(exp.purchase?.purchase_number || String(exp.purchase_id))}`}
                            style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none', fontSize: 12 }}
                            title="Open purchase order"
                          >
                            {exp.purchase?.purchase_number || `PO #${exp.purchase_id}`}
                          </Link>
                        ) : (
                          <span style={{ color: '#C4B5A3' }}>—</span>
                        )}
                      </td>
                      <td style={{ ...TD, color: '#6B5D4F' }}>{paymentMethodLabel(exp.payment_method)}</td>
                      <td style={TD}>
                        <Badge label={exp.status} color={STATUS_COLOR[exp.status] ?? 'gray'} />
                      </td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {exp.status === 'pending' && (
                            <Btn small onClick={() => void handleApprove(exp)} disabled={actionLoading === exp.id}>
                              {actionLoading === exp.id ? '…' : '✓ Approve'}
                            </Btn>
                          )}
                          <Btn small variant="secondary" onClick={() => triggerReceiptUpload(exp.id)} disabled={actionLoading === exp.id}>
                            {actionLoading === exp.id ? '…' : '📎 Receipt'}
                          </Btn>
                          <Btn small variant="secondary" onClick={() => void handlePushXero(exp)} disabled={actionLoading === exp.id || exp.is_auto}>
                            {actionLoading === exp.id ? '…' : 'Xero ↑'}
                          </Btn>
                          {!exp.is_auto && (
                            <>
                              <Btn small variant="secondary" onClick={() => handleEdit(exp)}>Edit</Btn>
                              <Btn small variant="danger" onClick={() => handleDelete(exp.id)}>Delete</Btn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr><td colSpan={9}><EmptyState message="No expenses in this date range." /></td></tr>
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

      {/* Edit Expense Modal */}
      {editingExpense && (
        <Modal title="Edit Expense" onClose={() => { setEditingExpense(null); setForm(emptyForm); setError(''); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Category *
              <select value={form.expense_category_id} onChange={(e) => setForm((f) => ({ ...f, expense_category_id: e.target.value }))} style={{ ...fieldStyle, marginTop: 4 }}>
                <option value="">Select category</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Description *
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ ...fieldStyle, marginTop: 4 }} />
            </label>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
                Amount (MVR) *
                <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} style={{ ...fieldStyle, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
                Date *
                <input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} style={{ ...fieldStyle, marginTop: 4 }} />
              </label>
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Payment Method
              <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} style={{ ...fieldStyle, marginTop: 4 }}>
                {ADMIN_EXPENSE_PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>
              Notes
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...fieldStyle, height: 'auto', padding: '8px 10px', resize: 'vertical', marginTop: 4 }} />
            </label>
            {editingExpense.purchase && (
              <div style={{ fontSize: 12, color: '#6B5D4F' }}>
                Linked PO:{' '}
                <Link
                  to={`/purchase-orders?search=${encodeURIComponent(editingExpense.purchase.purchase_number)}`}
                  style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}
                >
                  {editingExpense.purchase.purchase_number}
                </Link>
              </div>
            )}
            <GstExpenseFields form={form} setForm={setForm} fieldStyle={fieldStyle} />
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => { setEditingExpense(null); setForm(emptyForm); }}>Cancel</Btn>
            <Btn onClick={handleUpdate} disabled={saving || !form.expense_category_id || !form.description || !form.amount}>
              {saving ? 'Saving…' : 'Update Expense'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Add Expense Modal */}
      {showAdd && (
        <Modal title="Add Expense" onClose={() => { setShowAdd(false); setLinkedPurchase(null); setError(''); }}>
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
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                {ADMIN_EXPENSE_PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
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
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block' }}>
              Link to purchase order (optional)
              <div style={{ marginTop: 4 }}>
                <PurchaseSearch value={linkedPurchase} onChange={setLinkedPurchase} />
              </div>
            </label>
            <GstExpenseFields form={form} setForm={setForm} fieldStyle={fieldStyle} />
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => { setShowAdd(false); setLinkedPurchase(null); }}>Cancel</Btn>
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
