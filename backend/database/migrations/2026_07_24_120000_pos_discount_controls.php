<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * POS Discount Controls: order columns, discount_approvals, SiteSetting defaults
 * (deploy-neutral), permissions + resync, SMS template for approval OTP.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (!Schema::hasColumn('orders', 'manual_discount_reason')) {
                $table->string('manual_discount_reason')->nullable()->after('manual_discount_laar');
            }
            if (!Schema::hasColumn('orders', 'manual_discount_reason_note')) {
                $table->string('manual_discount_reason_note', 255)->nullable()->after('manual_discount_reason');
            }
            if (!Schema::hasColumn('orders', 'manual_discount_approved_by')) {
                $table->foreignId('manual_discount_approved_by')
                    ->nullable()
                    ->after('manual_discount_reason_note')
                    ->constrained('users')
                    ->nullOnDelete();
            }
        });

        if (!Schema::hasTable('discount_approvals')) {
            Schema::create('discount_approvals', function (Blueprint $table) {
                $table->id();
                $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
                $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
                $table->unsignedInteger('subtotal_laar');
                $table->unsignedInteger('discount_laar');
                $table->decimal('discount_percent', 6, 2)->nullable();
                $table->string('reason')->nullable();
                $table->string('reason_note', 255)->nullable();
                $table->string('code_hash', 255);
                $table->timestamp('expires_at');
                $table->unsignedTinyInteger('attempts')->default(0);
                $table->string('status', 20)->default('pending'); // pending|approved|expired|failed
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['status', 'expires_at']);
            });
        }

        $now = now();
        $reasons = [
            'Loyal customer',
            'Service recovery / complaint',
            'Staff meal',
            'Manager comp',
            'Damaged / quality issue',
            'Price match',
            'Promotional (ad-hoc)',
            'Other (note required)',
        ];

        $settings = [
            [
                'key' => 'discount_manual_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'discounts',
                'label' => 'Manual POS discounts enabled',
                'description' => 'Global switch for manual discounts at POS.',
                'is_public' => false,
            ],
            [
                'key' => 'discount_max_percent',
                'value' => '100',
                'type' => 'text',
                'group' => 'discounts',
                'label' => 'Max discount percent',
                'description' => 'Global max discount as % of subtotal (100 = unlimited within subtotal).',
                'is_public' => false,
            ],
            [
                'key' => 'discount_max_fixed_mvr',
                'value' => '0',
                'type' => 'text',
                'group' => 'discounts',
                'label' => 'Max fixed discount (MVR)',
                'description' => 'Optional absolute MVR ceiling; 0 disables the fixed cap.',
                'is_public' => false,
            ],
            [
                'key' => 'discount_role_caps',
                'value' => '{}',
                'type' => 'json',
                'group' => 'discounts',
                'label' => 'Per-role discount caps',
                'description' => 'Optional JSON map of role slug → {percent, fixed_mvr}.',
                'is_public' => false,
            ],
            [
                'key' => 'discount_reason_required',
                'value' => 'false',
                'type' => 'boolean',
                'group' => 'discounts',
                'label' => 'Require discount reason',
                'description' => 'When on, every manual discount needs a preset reason.',
                'is_public' => false,
            ],
            [
                'key' => 'discount_reasons',
                'value' => json_encode($reasons, JSON_UNESCAPED_UNICODE),
                'type' => 'json',
                'group' => 'discounts',
                'label' => 'Discount reason presets',
                'description' => 'Admin-editable list of reason labels.',
                'is_public' => false,
            ],
            [
                'key' => 'discount_approval_required',
                'value' => 'false',
                'type' => 'boolean',
                'group' => 'discounts',
                'label' => 'Require SMS approval for discounts',
                'description' => 'When on, every manual discount needs an SMS one-time code.',
                'is_public' => false,
            ],
            [
                'key' => 'discount_approval_approvers',
                'value' => '[]',
                'type' => 'json',
                'group' => 'discounts',
                'label' => 'Discount approval approvers',
                'description' => 'JSON list of {user_id?, phone, label} who receive approval codes.',
                'is_public' => false,
            ],
            [
                'key' => 'discount_approval_code_ttl_minutes',
                'value' => '10',
                'type' => 'text',
                'group' => 'discounts',
                'label' => 'Approval code TTL (minutes)',
                'description' => 'How long an SMS approval code remains valid.',
                'is_public' => false,
            ],
            [
                'key' => 'discount_approval_max_attempts',
                'value' => '5',
                'type' => 'text',
                'group' => 'discounts',
                'label' => 'Approval code max attempts',
                'description' => 'Wrong-code tries before the code is invalidated.',
                'is_public' => false,
            ],
        ];

        $hasScope = Schema::hasColumn('site_settings', 'scope');
        $hasLocale = Schema::hasColumn('site_settings', 'locale');

        foreach ($settings as $row) {
            $match = ['key' => $row['key']];
            if ($hasScope) {
                $match['scope'] = 'shared';
                $row['scope'] = 'shared';
            }
            if ($hasLocale) {
                $match['locale'] = 'en';
                $row['locale'] = 'en';
            }

            DB::table('site_settings')->updateOrInsert(
                $match,
                array_merge($row, [
                    'created_at' => $now,
                    'updated_at' => $now,
                ]),
            );
        }

        SiteSetting::bust();

        DB::table('sms_templates')->updateOrInsert(
            ['slug' => 'discount_approval_otp'],
            [
                'name' => 'Discount Approval OTP',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: approval code {{code}} for a {{percent}}% ({{amount}}) discount on order {{order}}. Expires in {{minutes}} min. Do not share.',
                'description' => 'SMS one-time code for POS manual discount approval.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'code', 'description' => '4-digit approval code'],
                    ['name' => 'percent', 'description' => 'Discount percent of subtotal'],
                    ['name' => 'amount', 'description' => 'Discount amount (MVR)'],
                    ['name' => 'order', 'description' => 'Order number / id'],
                    ['name' => 'minutes', 'description' => 'Code lifetime in minutes'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        foreach (['owner', 'manager', 'staff'] as $slug) {
            Role::firstOrCreate(
                ['slug' => $slug],
                ['name' => ucfirst($slug), 'description' => '', 'is_active' => true],
            );
        }

        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        Schema::dropIfExists('discount_approvals');

        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'manual_discount_approved_by')) {
                $table->dropConstrainedForeignId('manual_discount_approved_by');
            }
            if (Schema::hasColumn('orders', 'manual_discount_reason_note')) {
                $table->dropColumn('manual_discount_reason_note');
            }
            if (Schema::hasColumn('orders', 'manual_discount_reason')) {
                $table->dropColumn('manual_discount_reason');
            }
        });
    }
};
