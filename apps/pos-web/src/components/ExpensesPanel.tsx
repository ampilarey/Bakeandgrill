import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  approveExpense,
  deleteExpense,
  getExpenseCategories,
  getExpenses,
  storeExpense,
  type Expense,
  type ExpenseCategory,
} from "../api/expenses";
import { EmptyState, PanelShell } from "./openTickets/PanelShell";

type Props = {
  onClose: () => void;
};

function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Indian/Maldives" });
}

function monthStartYmd(): string {
  const t = todayYmd();
  return `${t.slice(0, 7)}-01`;
}

const fieldStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1.5px solid #E2E8F0",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
  background: "#fff",
};

const PAY_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

function money(n: unknown): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  return (Number.isFinite(v) ? v : 0).toFixed(2);
}

export function ExpensesPanel({ onClose }: Props) {
  const [from, setFrom] = useState(() => monthStartYmd());
  const [to, setTo] = useState(() => todayYmd());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    expense_category_id: "",
    description: "",
    amount: "",
    expense_date: todayYmd(),
    payment_method: "cash",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, catRes] = await Promise.all([
        getExpenses({ from, to, page: 1 }),
        getExpenseCategories(),
      ]);
      setExpenses(list.data ?? []);
      const rawTotal = list.total_amount ?? 0;
      setTotalAmount(typeof rawTotal === "number" ? rawTotal : parseFloat(String(rawTotal)) || 0);
      setCats(catRes.categories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load expenses.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    const catId = parseInt(form.expense_category_id, 10);
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(catId) || !Number.isFinite(amount) || amount <= 0 || !form.description.trim()) {
      setError("Category, description, and a valid amount are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await storeExpense({
        expense_category_id: catId,
        description: form.description.trim(),
        amount,
        expense_date: form.expense_date || todayYmd(),
        payment_method: form.payment_method || undefined,
        notes: form.notes.trim() || undefined,
      });
      setShowAdd(false);
      setForm({
        expense_category_id: "",
        description: "",
        amount: "",
        expense_date: todayYmd(),
        payment_method: "cash",
        notes: "",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save expense.");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (exp: Expense) => {
    setBusyId(exp.id);
    setError("");
    try {
      const { expense } = await approveExpense(exp.id);
      setExpenses((prev) => prev.map((e) => (e.id === exp.id ? expense : e)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (exp: Expense) => {
    if (exp.is_auto) return;
    if (!window.confirm(`Delete ${exp.expense_number}? This cannot be undone.`)) return;
    setBusyId(exp.id);
    setError("");
    try {
      await deleteExpense(exp.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PanelShell
      title="Expenses"
      subtitle="Log operating costs (owner / finance)"
      onClose={onClose}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => { setShowAdd(true); setError(""); }}
          style={{
            minHeight: 44, padding: "0 14px", borderRadius: 10, border: "none",
            background: "#D4813A", color: "#fff", fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit", fontSize: 13,
          }}
        >
          + Add expense
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...fieldStyle, marginTop: 4, minWidth: 150 }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...fieldStyle, marginTop: 4, minWidth: 150 }} />
        </label>
        <div style={{
          marginLeft: "auto", padding: "8px 14px", borderRadius: 10,
          background: "#FFF7ED", border: "1px solid #FDBA74", fontWeight: 800, fontSize: 14, color: "#9A3412",
        }}>
          Approved total: MVR {money(totalAmount)}
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 10, padding: "10px 12px", borderRadius: 8,
          background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#64748B", fontSize: 14 }}>Loading…</p>
      ) : expenses.length === 0 ? (
        <EmptyState emoji="💸" title="No expenses" body="Nothing logged in this date range yet." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {expenses.map((exp) => {
            const busy = busyId === exp.id;
            return (
              <div
                key={exp.id}
                style={{
                  border: "1px solid #E2E8F0", borderRadius: 12, padding: 12,
                  background: "#fff", display: "flex", gap: 12, flexWrap: "wrap",
                  alignItems: "center", justifyContent: "space-between",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#0F172A" }}>
                    {exp.description}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                    {exp.expense_number}
                    {exp.category ? ` · ${exp.category.name}` : ""}
                    {` · ${exp.expense_date}`}
                    {exp.payment_method ? ` · ${exp.payment_method}` : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A" }}>
                  MVR {money(exp.amount)}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                  padding: "4px 8px", borderRadius: 6,
                  background: exp.status === "approved" ? "#ECFDF5" : exp.status === "rejected" ? "#FEF2F2" : "#FFFBEB",
                  color: exp.status === "approved" ? "#047857" : exp.status === "rejected" ? "#B91C1C" : "#B45309",
                }}>
                  {exp.status}
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {exp.status === "pending" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleApprove(exp)}
                      style={{
                        minHeight: 40, padding: "0 12px", borderRadius: 8, border: "none",
                        background: "#0F172A", color: "#fff", fontWeight: 700, cursor: "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      Approve
                    </button>
                  )}
                  {!exp.is_auto && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(exp)}
                      style={{
                        minHeight: 40, padding: "0 12px", borderRadius: 8,
                        border: "1px solid #FECACA", background: "#fff", color: "#B91C1C",
                        fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1,
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 900, background: "rgba(15,23,42,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div style={{
            width: "min(440px, 100%)", maxHeight: "90vh", overflow: "auto",
            background: "#fff", borderRadius: 14, padding: 20,
            boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Add expense</h3>
              <button type="button" onClick={() => setShowAdd(false)} style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
                Category *
                <select
                  value={form.expense_category_id}
                  onChange={(e) => setForm((f) => ({ ...f, expense_category_id: e.target.value }))}
                  style={{ ...fieldStyle, marginTop: 4 }}
                >
                  <option value="">Select…</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
                Description *
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Gas cylinder"
                  style={{ ...fieldStyle, marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
                Amount (MVR) *
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  style={{ ...fieldStyle, marginTop: 4 }}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
                  Date
                  <input
                    type="date"
                    value={form.expense_date}
                    onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                    style={{ ...fieldStyle, marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
                  Paid by
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                    style={{ ...fieldStyle, marginTop: 4 }}
                  >
                    {PAY_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
                Notes
                <input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  style={{ ...fieldStyle, marginTop: 4 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 10,
                  border: "1px solid #E2E8F0", background: "#fff", fontWeight: 700, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleAdd()}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 10, border: "none",
                  background: "#D4813A", color: "#fff", fontWeight: 700, cursor: "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PanelShell>
  );
}
