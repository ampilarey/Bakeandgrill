<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-10-10: "Fix" the duplicate messages the audit found.
 *
 * - receipts.confirmation_email_sent_at: the payment confirmation email is
 *   claimed once per order; up to three paths announce one payment.
 * - orders.delay_alerted_at: a delivery past its ETA is reported once, not
 *   every hour until it arrives.
 * - The "Order delivered" wording carries the receipt link, since the
 *   separate receipt text no longer follows it ({{receipt_url}}), when the
 *   owner has not changed it.
 * - "Refund requested" is gone: the code text (or, for an owner's refund,
 *   "processed") is the one message when a refund starts. Its template is
 *   removed so Templates does not list a wording nothing uses.
 */
return new class extends Migration
{
    private const DELIVERED_OLD = 'Bake & Grill: #{{order_number}} has been delivered. Enjoy! {{tracking_url}}';

    private const DELIVERED_NEW = 'Bake & Grill: #{{order_number}} has been delivered. Enjoy! Receipt: {{receipt_url}}';

    public function up(): void
    {
        if (Schema::hasTable('receipts') && !Schema::hasColumn('receipts', 'confirmation_email_sent_at')) {
            Schema::table('receipts', function (Blueprint $table): void {
                $table->timestamp('confirmation_email_sent_at')->nullable();
            });
        }
        if (Schema::hasTable('orders') && !Schema::hasColumn('orders', 'delay_alerted_at')) {
            Schema::table('orders', function (Blueprint $table): void {
                $table->timestamp('delay_alerted_at')->nullable();
            });
        }

        if (!Schema::hasTable('sms_templates')) {
            return;
        }
        DB::table('sms_templates')->where('slug', 'customer_order_delivered')->update([
            'variables' => json_encode([
                ['name' => 'order_number', 'description' => 'Order reference number'],
                ['name' => 'receipt_url', 'description' => 'Receipt link (added at the end when the wording leaves it out)'],
                ['name' => 'tracking_url', 'description' => 'Order tracking link'],
            ]),
            'description' => 'Sent when the rider marks a delivery order delivered. It carries the receipt, so no separate receipt text follows.',
            'updated_at' => now(),
        ]);
        DB::table('sms_templates')->where('slug', 'customer_order_delivered')->where('body', self::DELIVERED_OLD)
            ->update(['body' => self::DELIVERED_NEW]);
        DB::table('sms_templates')->where('slug', 'customer_refund_requested')->delete();
    }

    public function down(): void
    {
        if (Schema::hasTable('sms_templates')) {
            DB::table('sms_templates')->where('slug', 'customer_order_delivered')->where('body', self::DELIVERED_NEW)
                ->update(['body' => self::DELIVERED_OLD]);
            if (!DB::table('sms_templates')->where('slug', 'customer_refund_requested')->exists()) {
                DB::table('sms_templates')->insert([
                    'slug' => 'customer_refund_requested',
                    'name' => 'Refund requested (customer)',
                    'type' => 'order_notification',
                    'body' => 'Bake & Grill: a refund has been requested on order {{order_number}}. We will message you again when it is processed.',
                    'description' => 'Sent to the order phone when staff raise a refund request.',
                    'is_system' => true,
                    'variables' => json_encode([['name' => 'order_number', 'description' => 'Order reference number']]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
        if (Schema::hasTable('orders') && Schema::hasColumn('orders', 'delay_alerted_at')) {
            Schema::table('orders', fn (Blueprint $table) => $table->dropColumn('delay_alerted_at'));
        }
        if (Schema::hasTable('receipts') && Schema::hasColumn('receipts', 'confirmation_email_sent_at')) {
            Schema::table('receipts', fn (Blueprint $table) => $table->dropColumn('confirmation_email_sent_at'));
        }
    }
};
