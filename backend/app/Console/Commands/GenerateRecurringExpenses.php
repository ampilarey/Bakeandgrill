<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Expense;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class GenerateRecurringExpenses extends Command
{
    protected $signature = 'expenses:generate-recurring {--dry-run : Preview without saving}';
    protected $description = 'Create new expense entries for recurring expenses that are due today';

    public function handle(): int
    {
        $today = now()->toDateString();

        // Collect IDs first so we can lock each row individually.
        $ids = Expense::where('is_recurring', true)
            ->whereNotNull('next_recurrence_date')
            ->where('next_recurrence_date', '<=', $today)
            ->where('status', 'approved')
            ->pluck('id');

        if ($ids->isEmpty()) {
            $this->info('No recurring expenses due today.');

            return 0;
        }

        $this->info("Found {$ids->count()} recurring expense(s) due.");

        $created = 0;

        foreach ($ids as $parentId) {
            // Wrap each expense in its own transaction with a lock so that
            // overlapping scheduler runs cannot generate duplicate entries.
            DB::transaction(function () use ($parentId, $today, &$created): void {
                $parent = Expense::lockForUpdate()->find($parentId);

                if (!$parent) {
                    return;
                }

                // Re-check inside the lock — another process may have already advanced the date.
                if ($parent->next_recurrence_date === null || $parent->next_recurrence_date->toDateString() > $today) {
                    return;
                }

                $this->line("  → {$parent->description} (MVR {$parent->amount}) [{$parent->recurrence_interval}]");

                if (!$this->option('dry-run')) {
                    $newExpense = Expense::create([
                        'expense_number' => $this->generateExpenseNumber(),
                        'expense_category_id' => $parent->expense_category_id,
                        'supplier_id' => $parent->supplier_id,
                        'user_id' => $parent->user_id,
                        'description' => $parent->description,
                        'amount' => $parent->amount,
                        'amount_laar' => $parent->amount_laar,
                        'tax_amount' => $parent->tax_amount,
                        'tax_laar' => $parent->tax_laar,
                        'payment_method' => $parent->payment_method,
                        'expense_date' => $today,
                        'is_recurring' => false,
                        'status' => 'approved',
                        'notes' => "Auto-generated from recurring expense #{$parent->expense_number}",
                    ]);

                    // Advance the next_recurrence_date INSIDE the transaction so a second
                    // concurrent run sees the updated date immediately on lock acquisition.
                    $parent->next_recurrence_date = $this->nextDate($parent->next_recurrence_date->toDateString(), $parent->recurrence_interval);
                    $parent->save();

                    $created++;
                    $this->line("    Created #{$newExpense->expense_number}, next due: {$parent->next_recurrence_date->toDateString()}");
                }
            });
        }

        if ($this->option('dry-run')) {
            $this->warn('Dry-run mode: nothing was saved.');
        } else {
            $this->info("Created {$created} expense(s).");
        }

        return 0;
    }

    private function nextDate(string $from, ?string $interval): string
    {
        return match ($interval) {
            'daily' => now()->parse($from)->addDay()->toDateString(),
            'weekly' => now()->parse($from)->addWeek()->toDateString(),
            'quarterly' => now()->parse($from)->addMonths(3)->toDateString(),
            'yearly' => now()->parse($from)->addYear()->toDateString(),
            default => now()->parse($from)->addMonth()->toDateString(),
        };
    }

    private function generateExpenseNumber(): string
    {
        $date = now()->format('Ymd');
        $count = Expense::whereDate('created_at', now()->toDateString())->withTrashed()->count() + 1;

        return 'EXP-' . $date . '-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
    }
}
