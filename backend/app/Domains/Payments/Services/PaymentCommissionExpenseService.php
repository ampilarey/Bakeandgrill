<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PaymentCommissionExpenseService
{
    public function category(): ExpenseCategory
    {
        return ExpenseCategory::firstOrCreate(
            ['slug' => 'bank-payment-processing'],
            ['name' => 'Bank / payment processing', 'icon' => '💳', 'is_active' => true],
        );
    }

    public function syncForPayment(Payment $payment): ?Expense
    {
        // Guard mid-migration / older DBs: expenses.payment_id lands in a later migration.
        if (! Schema::hasColumn('expenses', 'payment_id')) {
            return null;
        }

        $payment->refresh();

        if ($payment->commission_channel === null || (int) $payment->commission_laar <= 0) {
            return null;
        }

        return DB::transaction(function () use ($payment): ?Expense {
            $existing = Expense::where('payment_id', $payment->id)->lockForUpdate()->first();
            if ($existing !== null) {
                return $existing;
            }

            $payment->loadMissing('order');

            $userId = $payment->collected_by_user_id
                ?? $payment->order?->user_id
                ?? User::query()->whereHas('role', fn ($q) => $q->where('slug', 'owner'))->value('id');

            if ($userId === null) {
                return null;
            }

            $amountLaar = (int) $payment->commission_laar;
            $amount = round($amountLaar / 100, 2);
            $ratePercent = round((int) ($payment->commission_rate_bp ?? 0) / 100, 2);
            $channelLabel = $payment->commission_channel === PaymentCommissionService::CHANNEL_POS_CARD
                ? 'POS card'
                : 'Online / BML gateway';
            $orderRef = $payment->order?->order_number ?? (string) $payment->order_id;

            return Expense::create([
                'expense_number' => $this->generateExpenseNumber(),
                'expense_category_id' => $this->category()->id,
                'payment_id' => $payment->id,
                'user_id' => $userId,
                'description' => sprintf(
                    'Bank processing fee — %s — Order #%s (%s%%)',
                    $channelLabel,
                    $orderRef,
                    number_format($ratePercent, 1),
                ),
                'amount_laar' => $amountLaar,
                'amount' => $amount,
                'tax_laar' => 0,
                'tax_amount' => 0,
                'payment_method' => $payment->method,
                'reference_number' => 'PAY-COMM-' . $payment->id,
                'expense_date' => ($payment->processed_at ?? now())->toDateString(),
                'status' => 'approved',
                'notes' => sprintf(
                    'Auto-recorded from payment #%d. Estimated BML/processing fee on MVR %s tender.',
                    $payment->id,
                    number_format((float) $payment->amount, 2),
                ),
            ]);
        });
    }

    private function generateExpenseNumber(): string
    {
        $date = now()->format('Ymd');
        // Postgres rejects FOR UPDATE with aggregates — lock the rows, count in PHP.
        $count = Expense::whereDate('created_at', now()->toDateString())
            ->withTrashed()
            ->lockForUpdate()
            ->get(['id'])
            ->count() + 1;

        return 'EXP-' . $date . '-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
    }
}
