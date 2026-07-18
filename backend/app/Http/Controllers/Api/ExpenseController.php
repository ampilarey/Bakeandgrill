<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Gst\Services\GstInputTaxValidator;
use App\Domains\Gst\Services\GstLedgerPoster;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ExpenseController extends Controller
{
    public function __construct(private readonly AuditLogService $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = Expense::with([
            'category:id,name,icon,slug',
            'supplier:id,name',
            'user:id,name',
            'purchase:id,purchase_number,total',
        ])->orderByDesc('expense_date');

        if ($request->filled('category_id')) {
            $query->where('expense_category_id', $request->query('category_id'));
        }
        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->query('supplier_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('from')) {
            $query->whereDate('expense_date', '>=', $request->query('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('expense_date', '<=', $request->query('to'));
        }
        if ($request->filled('recurring')) {
            $query->where('is_recurring', filter_var($request->query('recurring'), FILTER_VALIDATE_BOOLEAN));
        }
        if ($request->filled('search')) {
            $term = '%' . str_replace(['%', '_'], ['\\%', '\\_'], (string) $request->query('search')) . '%';
            $query->where(function ($q) use ($term) {
                $q->where('expense_number', 'like', $term)
                    ->orWhere('description', 'like', $term)
                    ->orWhere('notes', 'like', $term)
                    ->orWhere('reference_number', 'like', $term)
                    ->orWhere('supplier_invoice_no', 'like', $term)
                    ->orWhereHas('supplier', fn ($sq) => $sq->where('name', 'like', $term));
            });
        }

        $paginator = $query->paginate(20);

        $applyFilters = function ($q) use ($request) {
            return $q->when($request->filled('category_id'), fn ($qq) => $qq->where('expense_category_id', $request->query('category_id')))
                ->when($request->filled('supplier_id'), fn ($qq) => $qq->where('supplier_id', $request->query('supplier_id')))
                ->when($request->filled('from'), fn ($qq) => $qq->whereDate('expense_date', '>=', $request->query('from')))
                ->when($request->filled('to'), fn ($qq) => $qq->whereDate('expense_date', '<=', $request->query('to')))
                ->when($request->filled('recurring'), fn ($qq) => $qq->where('is_recurring', filter_var($request->query('recurring'), FILTER_VALIDATE_BOOLEAN)))
                ->when($request->filled('search'), function ($qq) use ($request) {
                    $term = '%' . str_replace(['%', '_'], ['\\%', '\\_'], (string) $request->query('search')) . '%';
                    $qq->where(function ($inner) use ($term) {
                        $inner->where('expense_number', 'like', $term)
                            ->orWhere('description', 'like', $term)
                            ->orWhere('notes', 'like', $term)
                            ->orWhere('reference_number', 'like', $term)
                            ->orWhere('supplier_invoice_no', 'like', $term)
                            ->orWhereHas('supplier', fn ($sq) => $sq->where('name', 'like', $term));
                    });
                });
        };

        return response()->json([
            'data' => collect($paginator->items())->map(fn ($e) => $this->format($e)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
            'total_amount' => $applyFilters(Expense::query())->where('status', 'approved')->sum('amount'),
        ]);
    }

    public function categories(): JsonResponse
    {
        $cats = ExpenseCategory::where('is_active', true)->orderBy('name')->get();

        return response()->json(['categories' => $cats->map(fn ($c) => [
            'id' => $c->id,
            'name' => $c->name,
            'slug' => $c->slug,
            'icon' => $c->icon,
        ])]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'expense_category_id' => ['required', 'integer', 'exists:expense_categories,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'purchase_id' => ['nullable', 'integer', 'exists:purchases,id'],
            'description' => ['required', 'string', 'max:500'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'expense_date' => ['required', 'date'],
            'is_recurring' => ['nullable', 'boolean'],
            'recurrence_interval' => ['nullable', 'in:daily,weekly,monthly,quarterly,yearly'],
            'notes' => ['nullable', 'string'],
            'supplier_tin' => ['nullable', 'string', 'max:30'],
            'supplier_invoice_no' => ['nullable', 'string', 'max:64'],
            'supplier_invoice_date' => ['nullable', 'date'],
            'amount_excluding_gst_laar' => ['nullable', 'integer', 'min:0'],
            'gst_rate_bp' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'is_tax_invoice_received' => ['nullable', 'boolean'],
            'is_input_tax_claimable' => ['nullable', 'boolean'],
            'claim_block_reason' => ['nullable', 'string', 'max:500'],
            'revenue_or_capital' => ['nullable', 'in:revenue,capital'],
            'taxable_activity_no' => ['nullable', 'string', 'max:30'],
        ]);

        $validator = app(GstInputTaxValidator::class);
        $validated = $validator->normalizeExpense($validated);
        $validator->assertClaimable($validated, 'expense');
        $validated['user_id'] = $request->user()->id;
        $validated['amount_laar'] = (int) round($validated['amount'] * 100);
        $validated['tax_laar'] = (int) round(($validated['tax_amount'] ?? 0) * 100);
        $validated['tax_amount'] = $validated['tax_amount'] ?? 0;
        $validated['expense_number'] = $this->generateExpenseNumber();

        if ($validated['is_recurring'] ?? false) {
            $validated['next_recurrence_date'] = $this->nextRecurrenceDate(
                $validated['expense_date'],
                $validated['recurrence_interval'] ?? 'monthly',
            );
        }

        $expense = Expense::create($validated);
        $this->audit->log('expense.created', 'Expense', $expense->id, [], ['description' => $expense->description, 'amount' => $expense->amount], [], $request);

        return response()->json(['expense' => $this->format($expense->load('category', 'supplier', 'purchase'))], 201);
    }

    public function show(int $id): JsonResponse
    {
        $expense = Expense::with(['category', 'supplier', 'user', 'approvedBy', 'purchase'])->findOrFail($id);

        return response()->json(['expense' => $this->format($expense)]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $expense = Expense::findOrFail($id);
        $this->assertNotAutoExpense($expense);

        $validated = $request->validate([
            'expense_category_id' => ['sometimes', 'integer', 'exists:expense_categories,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'description' => ['sometimes', 'string', 'max:500'],
            'amount' => ['sometimes', 'numeric', 'min:0.01'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'expense_date' => ['sometimes', 'date'],
            'notes' => ['nullable', 'string'],
            'supplier_tin' => ['nullable', 'string', 'max:30'],
            'supplier_invoice_no' => ['nullable', 'string', 'max:64'],
            'supplier_invoice_date' => ['nullable', 'date'],
            'amount_excluding_gst_laar' => ['nullable', 'integer', 'min:0'],
            'gst_rate_bp' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'is_tax_invoice_received' => ['nullable', 'boolean'],
            'is_input_tax_claimable' => ['nullable', 'boolean'],
            'claim_block_reason' => ['nullable', 'string', 'max:500'],
            'revenue_or_capital' => ['nullable', 'in:revenue,capital'],
            'taxable_activity_no' => ['nullable', 'string', 'max:30'],
        ]);

        $validator = app(GstInputTaxValidator::class);
        $validated = $validator->normalizeExpense($validated);
        $validator->assertClaimable($validated, 'expense');

        if (isset($validated['amount'])) {
            $validated['amount_laar'] = (int) round($validated['amount'] * 100);
        }
        if (isset($validated['tax_amount'])) {
            $validated['tax_laar'] = (int) round($validated['tax_amount'] * 100);
        }

        $expense->update($validated);

        return response()->json(['expense' => $this->format($expense->fresh(['category', 'supplier']))]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $expense = Expense::findOrFail($id);
        $this->assertNotAutoExpense($expense);
        $expense->delete();
        $this->audit->log('expense.deleted', 'Expense', $id, [], [], [], $request);

        return response()->json(['message' => 'Expense deleted.']);
    }

    public function uploadReceipt(Request $request, int $id): JsonResponse
    {
        $request->validate(['receipt' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120']]);

        $expense = Expense::findOrFail($id);
        $path = $request->file('receipt')->store("expense-receipts/{$id}", 'public');
        $expense->update(['receipt_path' => $path]);

        return response()->json(['receipt_path' => $path]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $expense = Expense::findOrFail($id);

        abort_if(
            $expense->user_id === $request->user()->id,
            403,
            'You cannot approve your own expense.',
        );

        $expense->update(['status' => 'approved', 'approved_by' => $request->user()->id]);
        $fresh = $expense->fresh();
        app(GstInputTaxValidator::class)->assertClaimable($fresh->toArray(), 'expense');
        app(GstLedgerPoster::class)->postExpenseInput($fresh, $request->user()?->id);

        return response()->json(['expense' => $this->format($expense->fresh('category'))]);
    }

    public function summary(Request $request): JsonResponse
    {
        $from = $request->query('from', now()->startOfMonth()->toDateString());
        $to = $request->query('to', now()->toDateString());

        $byCategory = Expense::whereBetween('expense_date', [$from, $to])
            ->where('status', 'approved')
            ->join('expense_categories', 'expenses.expense_category_id', '=', 'expense_categories.id')
            ->selectRaw('expense_categories.name as category, expense_categories.icon, SUM(expenses.amount) as total, COUNT(*) as count')
            ->groupBy('expense_categories.id', 'expense_categories.name', 'expense_categories.icon')
            ->orderByDesc('total')
            ->get();

        $total = $byCategory->sum('total');

        return response()->json([
            'from' => $from,
            'to' => $to,
            'total' => (float) $total,
            'by_category' => $byCategory->map(fn ($r) => [
                'category' => $r->category,
                'icon' => $r->icon,
                'total' => (float) $r->total,
                'count' => (int) $r->count,
                'pct' => $total > 0 ? round($r->total / $total * 100, 1) : 0,
            ]),
        ]);
    }

    private function generateExpenseNumber(): string
    {
        return \DB::transaction(function () {
            $date = now()->format('Ymd');
            $count = Expense::whereDate('created_at', now()->toDateString())
                ->withTrashed()
                ->lockForUpdate()
                ->count() + 1;

            return 'EXP-' . $date . '-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
        });
    }

    private function nextRecurrenceDate(string $fromDate, string $interval): string
    {
        $date = \Illuminate\Support\Carbon::parse($fromDate);

        return match ($interval) {
            'daily' => $date->addDay()->toDateString(),
            'weekly' => $date->addWeek()->toDateString(),
            'quarterly' => $date->addMonths(3)->toDateString(),
            'yearly' => $date->addYear()->toDateString(),
            default => $date->addMonth()->toDateString(),
        };
    }

    private function format(Expense $e): array
    {
        return [
            'id' => $e->id,
            'expense_number' => $e->expense_number,
            'description' => $e->description,
            'amount' => (float) $e->amount,
            'tax_amount' => (float) $e->tax_amount,
            'total' => round((float) $e->amount + (float) $e->tax_amount, 2),
            'payment_method' => $e->payment_method,
            'reference_number' => $e->reference_number,
            'expense_date' => $e->expense_date?->toDateString(),
            'status' => $e->status,
            'is_recurring' => $e->is_recurring,
            'recurrence_interval' => $e->recurrence_interval,
            'next_recurrence_date' => $e->next_recurrence_date?->toDateString(),
            'receipt_path' => $e->receipt_path,
            'notes' => $e->notes,
            'category' => $e->category ? ['id' => $e->category->id, 'name' => $e->category->name, 'icon' => $e->category->icon] : null,
            'supplier' => $e->supplier ? ['id' => $e->supplier->id, 'name' => $e->supplier->name] : null,
            'purchase_id' => $e->purchase_id,
            'purchase' => $e->purchase ? [
                'id' => $e->purchase->id,
                'purchase_number' => $e->purchase->purchase_number,
                'total' => (float) $e->purchase->total,
            ] : null,
            'logged_by' => $e->user?->name,
            'approved_by' => $e->approvedBy?->name,
            'payment_id' => $e->payment_id,
            'is_auto' => $e->payment_id !== null,
            'supplier_tin' => $e->supplier_tin,
            'supplier_invoice_no' => $e->supplier_invoice_no,
            'supplier_invoice_date' => $e->supplier_invoice_date?->toDateString(),
            'amount_excluding_gst_laar' => $e->amount_excluding_gst_laar,
            'gst_rate_bp' => $e->gst_rate_bp,
            'is_tax_invoice_received' => (bool) $e->is_tax_invoice_received,
            'is_input_tax_claimable' => (bool) $e->is_input_tax_claimable,
            'claim_block_reason' => $e->claim_block_reason,
            'revenue_or_capital' => $e->revenue_or_capital,
            'taxable_activity_no' => $e->taxable_activity_no,
            'created_at' => $e->created_at,
        ];
    }

    private function assertNotAutoExpense(Expense $expense): void
    {
        abort_if(
            $expense->payment_id !== null,
            422,
            'This expense was auto-recorded from a card/gateway payment and cannot be edited or deleted.',
        );
    }
}
