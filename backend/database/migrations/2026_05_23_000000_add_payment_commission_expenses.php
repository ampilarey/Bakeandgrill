<?php

declare(strict_types=1);

use App\Domains\Payments\Services\PaymentCommissionExpenseService;
use App\Models\Payment;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->foreignId('payment_id')->nullable()->after('purchase_id')->constrained()->nullOnDelete();
            $table->unique('payment_id');
        });

        $now = now();
        DB::table('expense_categories')->updateOrInsert(
            ['slug' => 'bank-payment-processing'],
            [
                'name' => 'Bank / payment processing',
                'icon' => '💳',
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        $service = app(PaymentCommissionExpenseService::class);
        Payment::query()
            ->whereNotNull('commission_channel')
            ->where('commission_laar', '>', 0)
            ->whereNotExists(function ($q): void {
                $q->select(DB::raw(1))
                    ->from('expenses')
                    ->whereColumn('expenses.payment_id', 'payments.id');
            })
            ->orderBy('id')
            ->chunkById(200, function ($payments) use ($service): void {
                foreach ($payments as $payment) {
                    $service->syncForPayment($payment);
                }
            });
    }

    public function down(): void
    {
        $categoryId = DB::table('expense_categories')->where('slug', 'bank-payment-processing')->value('id');
        if ($categoryId) {
            DB::table('expenses')->where('expense_category_id', $categoryId)->whereNotNull('payment_id')->delete();
            DB::table('expense_categories')->where('id', $categoryId)->delete();
        }

        Schema::table('expenses', function (Blueprint $table) {
            $table->dropConstrainedForeignId('payment_id');
        });
    }
};
