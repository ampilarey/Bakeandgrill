<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Refund audit, 2026-09-25. A refund on an order paid by card or online was
 * approved, the customer was told "processed", and nothing was sent back:
 * no gateway refund exists and nothing recorded whether the bank transfer
 * was ever made. Each refund now stores the tender breakdown it was
 * approved on, the part owed outside the drawer, and when, how and by
 * whom that part was paid out. Two customer texts join: "on its way" when
 * money is owed externally, and "not approved" on rejection.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('refunds', function (Blueprint $table): void {
            $table->json('tender_breakdown')->nullable()->after('drawer_cash_out_laar');
            $table->bigInteger('external_tender_laar')->default(0)->after('tender_breakdown');
            $table->timestamp('paid_out_at')->nullable()->after('external_tender_laar');
            $table->string('paid_out_method', 30)->nullable()->after('paid_out_at');
            $table->string('paid_out_reference', 120)->nullable()->after('paid_out_method');
            $table->foreignId('paid_out_by')->nullable()->after('paid_out_reference')->constrained('users')->nullOnDelete();
            $table->index(['status', 'external_tender_laar', 'paid_out_at'], 'refunds_owed_idx');
        });

        $now = now();
        foreach ([
            [
                'slug' => 'customer_refund_on_its_way',
                'name' => 'Refund on its way (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: your refund of MVR {{amount}} on order {{order_number}} is approved. The part paid by card or online is being returned to you and we will message you when it is sent.',
                'description' => 'Sent when a refund is approved but part of it must be returned by card or bank transfer.',
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'amount', 'description' => 'Refund amount in MVR'],
                ]),
            ],
            [
                'slug' => 'customer_refund_rejected',
                'name' => 'Refund not approved (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: the refund requested on order {{order_number}} was not approved. Please contact us if you have questions.',
                'description' => 'Sent to the refund phone when a refund request is rejected.',
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                ]),
            ],
        ] as $template) {
            if (DB::table('sms_templates')->where('slug', $template['slug'])->exists()) {
                continue;
            }
            DB::table('sms_templates')->insert($template + ['is_system' => true, 'created_at' => $now, 'updated_at' => $now]);
        }
    }

    public function down(): void
    {
        Schema::table('refunds', function (Blueprint $table): void {
            $table->dropIndex('refunds_owed_idx');
            $table->dropConstrainedForeignId('paid_out_by');
            $table->dropColumn(['tender_breakdown', 'external_tender_laar', 'paid_out_at', 'paid_out_method', 'paid_out_reference']);
        });
        DB::table('sms_templates')->whereIn('slug', ['customer_refund_on_its_way', 'customer_refund_rejected'])->delete();
    }
};
