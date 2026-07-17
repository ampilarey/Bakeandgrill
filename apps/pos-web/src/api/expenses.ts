import { request } from "./client";

export type ExpenseCategory = { id: number; name: string; icon: string; slug: string };

export type Expense = {
  id: number;
  expense_number: string;
  description: string;
  amount: number;
  tax_amount: number;
  total: number;
  payment_method: string | null;
  expense_date: string;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  category: { id: number; name: string; icon: string } | null;
  logged_by: string | null;
  is_auto?: boolean;
};

export async function getExpenses(params: {
  from?: string;
  to?: string;
  status?: string;
  page?: number;
} = {}): Promise<{
  data: Expense[];
  meta: { total: number; current_page: number; last_page: number };
  total_amount: number;
}> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) q.set(k, String(v));
  });
  return request(`/expenses?${q}`);
}

export async function getExpenseCategories(): Promise<{ categories: ExpenseCategory[] }> {
  return request("/expenses/categories");
}

export async function storeExpense(data: {
  expense_category_id: number;
  description: string;
  amount: number;
  expense_date: string;
  payment_method?: string;
  notes?: string;
}): Promise<{ expense: Expense }> {
  return request("/expenses", { method: "POST", body: JSON.stringify(data) });
}

export async function approveExpense(id: number): Promise<{ expense: Expense }> {
  return request(`/expenses/${id}/approve`, { method: "POST" });
}

export async function deleteExpense(id: number): Promise<void> {
  await request(`/expenses/${id}`, { method: "DELETE" });
}
