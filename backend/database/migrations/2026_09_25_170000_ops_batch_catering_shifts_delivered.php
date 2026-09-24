<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ops audit follow-up, 2026-09-25: a nudge before a catering quote expires
 * and a thank-you after the event; a cash movement that can be voided
 * instead of reversed with a second entry; the opening float checked
 * against the previous close on the same till; a "delivered" text.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('catering_requests', function (Blueprint $table): void {
            $table->timestamp('quote_nudged_at')->nullable()->after('quote_expires_at');
            $table->timestamp('thank_you_sent_at')->nullable()->after('confirmed_at');
        });
        Schema::table('cash_movements', function (Blueprint $table): void {
            $table->timestamp('voided_at')->nullable()->after('reason');
            $table->foreignId('voided_by')->nullable()->after('voided_at')->constrained('users')->nullOnDelete();
            $table->string('void_reason', 255)->nullable()->after('voided_by');
        });
        Schema::table('shifts', function (Blueprint $table): void {
            // The previous close on this till, and how far the typed float was from it.
            $table->decimal('opening_float_expected', 10, 2)->nullable()->after('opening_cash');
            $table->decimal('opening_float_variance', 10, 2)->nullable()->after('opening_float_expected');
        });

        if (!DB::table('sms_templates')->where('slug', 'customer_order_delivered')->exists()) {
            $now = now();
            DB::table('sms_templates')->insert([
                'slug' => 'customer_order_delivered',
                'name' => 'Order delivered (customer)',
                'type' => 'customer_notification',
                'body' => 'Bake & Grill: #{{order_number}} has been delivered. Enjoy! {{tracking_url}}',
                'description' => 'Sent when the rider marks a delivery order delivered.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'tracking_url', 'description' => 'Order tracking link'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('catering_requests', function (Blueprint $table): void {
            $table->dropColumn(['quote_nudged_at', 'thank_you_sent_at']);
        });
        Schema::table('cash_movements', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('voided_by');
            $table->dropColumn(['voided_at', 'void_reason']);
        });
        Schema::table('shifts', function (Blueprint $table): void {
            $table->dropColumn(['opening_float_expected', 'opening_float_variance']);
        });
        DB::table('sms_templates')->where('slug', 'customer_order_delivered')->delete();
    }
};
