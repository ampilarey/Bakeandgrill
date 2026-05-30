<?php

declare(strict_types=1);

use App\Domains\Payments\Services\PaymentCommissionService;
use App\Models\Payment;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->unsignedInteger('commission_laar')->default(0)->after('amount_laar');
            $table->unsignedSmallInteger('commission_rate_bp')->nullable()->after('commission_laar');
            $table->string('commission_channel', 20)->nullable()->after('commission_rate_bp');
        });

        $now = now();
        $settings = [
            [
                'key' => 'payment_commission_enabled',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Charges',
                'label' => 'Enable payment commission tracking',
                'description' => 'Track BML/processing fees on POS card and online gateway payments.',
                'is_public' => false,
            ],
            [
                'key' => 'payment_commission_pos_card_rate_bp',
                'value' => '250',
                'type' => 'text',
                'group' => 'Charges',
                'label' => 'POS card commission rate (bp)',
                'description' => 'Basis points deducted from POS card income (250 = 2.5%).',
                'is_public' => false,
            ],
            [
                'key' => 'payment_commission_online_gateway_rate_bp',
                'value' => '250',
                'type' => 'text',
                'group' => 'Charges',
                'label' => 'Online gateway commission rate (bp)',
                'description' => 'Basis points deducted from BML/online gateway income (250 = 2.5%).',
                'is_public' => false,
            ],
        ];

        foreach ($settings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => $now, 'updated_at' => $now]),
            );
        }

        $service = app(PaymentCommissionService::class);
        Payment::query()
            ->whereIn('status', PaymentCommissionService::SETTLED_STATUSES)
            ->whereNull('commission_channel')
            ->orderBy('id')
            ->chunkById(200, function ($payments) use ($service): void {
                foreach ($payments as $payment) {
                    $service->applyToPayment($payment);
                }
            });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn(['commission_laar', 'commission_rate_bp', 'commission_channel']);
        });

        DB::table('site_settings')->whereIn('key', [
            'payment_commission_enabled',
            'payment_commission_pos_card_rate_bp',
            'payment_commission_online_gateway_rate_bp',
        ])->delete();
    }
};
