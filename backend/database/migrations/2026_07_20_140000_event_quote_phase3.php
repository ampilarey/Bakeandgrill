<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('catering_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('catering_requests', 'quote_token')) {
                $table->string('quote_token', 64)->nullable()->unique()->after('reference');
            }
            if (!Schema::hasColumn('catering_requests', 'quote_sent_at')) {
                $table->timestamp('quote_sent_at')->nullable()->after('quoted_at');
            }
            if (!Schema::hasColumn('catering_requests', 'quote_expires_at')) {
                $table->timestamp('quote_expires_at')->nullable()->after('quote_sent_at');
            }
            if (!Schema::hasColumn('catering_requests', 'quote_payment_laar')) {
                $table->bigInteger('quote_payment_laar')->nullable()->after('quote_expires_at');
            }
            if (!Schema::hasColumn('catering_requests', 'quote_is_deposit')) {
                $table->boolean('quote_is_deposit')->default(false)->after('quote_payment_laar');
            }
            if (!Schema::hasColumn('catering_requests', 'quote_version')) {
                $table->unsignedInteger('quote_version')->default(1)->after('quote_is_deposit');
            }
            if (!Schema::hasColumn('catering_requests', 'quote_subtotal_laar')) {
                $table->bigInteger('quote_subtotal_laar')->nullable()->after('quote_version');
            }
        });

        if (Schema::hasTable('catering_request_lines')
            && !Schema::hasColumn('catering_request_lines', 'price_needs_review')) {
            Schema::table('catering_request_lines', function (Blueprint $table) {
                $table->boolean('price_needs_review')->default(false)->after('is_custom');
            });
        }

        $now = now();
        foreach ([
            [
                'key' => 'catering_quote_valid_days',
                'value' => '7',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Catering quote validity (days)',
                'description' => 'How many days a sent quote link stays valid',
                'is_public' => false,
            ],
            [
                'key' => 'catering_quote_min_hours_before_event',
                'value' => '24',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Quote cutoff before event (hours)',
                'description' => 'Quotes expire at least this many hours before the event date',
                'is_public' => false,
            ],
        ] as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                [...$row, 'created_at' => $now, 'updated_at' => $now],
            );
        }

        DB::table('permissions')->updateOrInsert(
            ['slug' => 'events.manage'],
            [
                'name' => 'Manage events & catering quotes',
                'group' => 'Events',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        $permissionId = (int) DB::table('permissions')->where('slug', 'events.manage')->value('id');
        if ($permissionId > 0) {
            foreach (['owner', 'manager'] as $roleSlug) {
                $roleId = (int) DB::table('roles')->where('slug', $roleSlug)->value('id');
                if ($roleId > 0) {
                    DB::table('role_permission')->updateOrInsert(
                        ['role_id' => $roleId, 'permission_id' => $permissionId],
                        [],
                    );
                }
            }
        }
    }

    public function down(): void
    {
        $permissionId = (int) DB::table('permissions')->where('slug', 'events.manage')->value('id');
        if ($permissionId > 0) {
            DB::table('role_permission')->where('permission_id', $permissionId)->delete();
            DB::table('user_permission')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }

        DB::table('site_settings')->whereIn('key', [
            'catering_quote_valid_days',
            'catering_quote_min_hours_before_event',
        ])->delete();

        if (Schema::hasColumn('catering_request_lines', 'price_needs_review')) {
            Schema::table('catering_request_lines', function (Blueprint $table) {
                $table->dropColumn('price_needs_review');
            });
        }

        Schema::table('catering_requests', function (Blueprint $table) {
            foreach ([
                'quote_subtotal_laar',
                'quote_version',
                'quote_is_deposit',
                'quote_payment_laar',
                'quote_expires_at',
                'quote_sent_at',
                'quote_token',
            ] as $col) {
                if (Schema::hasColumn('catering_requests', $col)) {
                    if ($col === 'quote_token') {
                        $table->dropUnique(['quote_token']);
                    }
                    $table->dropColumn($col);
                }
            }
        });
    }
};
