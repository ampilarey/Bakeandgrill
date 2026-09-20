<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What has been paid on each purchase order, so the system can say what is
 * owed to whom (owner, 2026-09-21: close the buying loop). Until now a PO
 * knew its total and whether the goods arrived, but not whether the money
 * had gone out.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchases', function (Blueprint $table) {
            $table->decimal('paid_amount', 12, 2)->default(0)->after('total');
            $table->date('paid_at')->nullable()->after('paid_amount');
            $table->string('payment_method', 30)->nullable()->after('paid_at');
            $table->string('payment_ref', 120)->nullable()->after('payment_method');
        });

        // Weekly "what went up" SMS to the owner. Off until switched on in
        // Purchasing → Settings.
        DB::table('site_settings')->updateOrInsert(
            ['key' => 'ops_price_rise_alert_sms'],
            [
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Purchasing',
                'label' => 'SMS: weekly price rises (owner)',
                'description' => 'Every Monday, text the owner the items whose last buy was 10% or more above the one before.',
                'is_public' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        Schema::table('purchases', function (Blueprint $table) {
            $table->dropColumn(['paid_amount', 'paid_at', 'payment_method', 'payment_ref']);
        });
        DB::table('site_settings')->where('key', 'ops_price_rise_alert_sms')->delete();
    }
};
