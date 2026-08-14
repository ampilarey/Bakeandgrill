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
        if (! Schema::hasColumn('payments', 'commission_laar')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->unsignedInteger('commission_laar')->default(0)->after('amount_laar');
            });
        }
        if (! Schema::hasColumn('payments', 'commission_rate_bp')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->unsignedSmallInteger('commission_rate_bp')->nullable()->after('commission_laar');
            });
        }
        if (! Schema::hasColumn('payments', 'commission_channel')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->string('commission_channel', 20)->nullable()->after('commission_rate_bp');
            });
        }

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

        // Backfill payment commission columns only.
        // Do NOT call PaymentCommissionService::applyToPayment() here — that syncs
        // expenses via payment_id, which is added in 2026_05_23_000000.
        $service = app(PaymentCommissionService::class);
        Payment::query()
            ->whereIn('status', PaymentCommissionService::SETTLED_STATUSES)
            ->whereNull('commission_channel')
            ->orderBy('id')
            ->chunkById(200, function ($payments) use ($service): void {
                foreach ($payments as $payment) {
                    if (! $service->isEnabled()) {
                        continue;
                    }
                    $channel = $service->resolveChannel($payment);
                    if ($channel === null) {
                        continue;
                    }
                    $amountLaar = (int) ($payment->amount_laar ?? round((float) $payment->amount * 100));
                    if ($amountLaar <= 0) {
                        continue;
                    }
                    $rateBp = $service->rateBpForChannel($channel);
                    $payment->update([
                        'commission_laar' => $service->calculateCommissionLaar($amountLaar, $rateBp),
                        'commission_rate_bp' => $rateBp,
                        'commission_channel' => $channel,
                    ]);
                }
            });
    }

    public function down(): void
    {
        $cols = array_values(array_filter(
            ['commission_laar', 'commission_rate_bp', 'commission_channel'],
            fn (string $c) => Schema::hasColumn('payments', $c),
        ));
        if ($cols !== []) {
            Schema::table('payments', function (Blueprint $table) use ($cols) {
                $table->dropColumn($cols);
            });
        }

        DB::table('site_settings')->whereIn('key', [
            'payment_commission_enabled',
            'payment_commission_pos_card_rate_bp',
            'payment_commission_online_gateway_rate_bp',
        ])->delete();
    }
};
