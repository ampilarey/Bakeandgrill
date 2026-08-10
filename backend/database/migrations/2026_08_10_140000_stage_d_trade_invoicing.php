<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage D — trade invoicing, allocations, receivable payments, GST period stamp.
 * See docs/WHOLESALE_CONSIGNMENT_PLAN.md §3.5, §7, §8.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trade_invoice_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->foreignId('trade_delivery_line_id')->constrained('trade_delivery_lines')->restrictOnDelete();
            $table->unsignedInteger('qty_invoiced');
            $table->unsignedInteger('amount_laar');
            $table->string('line_kind', 16)->default('sold'); // sold|missing
            $table->timestamps();

            $table->unique(['invoice_id', 'trade_delivery_line_id', 'line_kind'], 'tia_invoice_line_kind_uq');
            $table->index('trade_delivery_line_id');
        });

        Schema::table('trade_deliveries', function (Blueprint $table) {
            $table->timestamp('mismatch_resolved_at')->nullable()->after('has_mismatch');
            $table->foreignId('mismatch_resolved_by')->nullable()->after('mismatch_resolved_at')
                ->constrained('users')->nullOnDelete();
            $table->text('mismatch_resolution_notes')->nullable()->after('mismatch_resolved_by');
            $table->boolean('missing_charge_waived')->default(false)->after('mismatch_resolution_notes');
            $table->text('missing_waive_reason')->nullable()->after('missing_charge_waived');
            $table->foreignId('missing_waived_by')->nullable()->after('missing_waive_reason')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('invoiced_at')->nullable()->after('reconciled_by');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->string('idempotency_key')->nullable()->unique()->after('token');
            $table->foreignId('trade_account_id')->nullable()->after('customer_id')
                ->constrained('trade_accounts')->nullOnDelete();
            $table->string('gst_period_key', 16)->nullable()->after('issue_date');
            $table->date('gst_ledger_date')->nullable()->after('gst_period_key');
        });

        Schema::table('customer_credit_ledger', function (Blueprint $table) {
            $table->string('idempotency_key')->nullable()->unique()->after('notes');
        });

        // payments.order_id was NOT NULL — make nullable and add invoice_id.
        // Exactly one of order_id / invoice_id must be set (enforced in service + MySQL check).
        try {
            Schema::table('payments', function (Blueprint $table) {
                $table->dropForeign(['order_id']);
            });
        } catch (\Throwable) {
            // FK name may differ across environments.
        }

        $driver = Schema::getConnection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE payments MODIFY order_id BIGINT UNSIGNED NULL');
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE payments ALTER COLUMN order_id DROP NOT NULL');
        } else {
            // SQLite: recreate-friendly change(); existing rows keep their order_id.
            Schema::table('payments', function (Blueprint $table) {
                $table->unsignedBigInteger('order_id')->nullable()->change();
            });
        }

        Schema::table('payments', function (Blueprint $table) {
            $table->foreign('order_id')->references('id')->on('orders')->nullOnDelete();
            if (! Schema::hasColumn('payments', 'invoice_id')) {
                $table->foreignId('invoice_id')->nullable()->after('order_id')
                    ->constrained('invoices')->nullOnDelete();
                $table->index('invoice_id');
            }
        });

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE payments ADD CONSTRAINT payments_order_xor_invoice_chk CHECK (
                (order_id IS NOT NULL AND invoice_id IS NULL) OR (order_id IS NULL AND invoice_id IS NOT NULL)
            )');
        }

        // Seed trade.invoice permission (owner-only via managerSlugs exclusion).
        $now = now();
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'trade.invoice'],
            [
                'name' => 'Raise wholesale invoices',
                'group' => 'Wholesale',
                'description' => 'Create trade invoices and resolve mismatches',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        $permId = DB::table('permissions')->where('slug', 'trade.invoice')->value('id');
        $ownerRoleId = DB::table('roles')->where('slug', 'owner')->value('id');
        if ($permId && $ownerRoleId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $ownerRoleId, 'permission_id' => $permId],
                [],
            );
        }
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            try {
                DB::statement('ALTER TABLE payments DROP CONSTRAINT payments_order_xor_invoice_chk');
            } catch (\Throwable) {
                // ignore
            }
        }

        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['invoice_id']);
            $table->dropColumn('invoice_id');
            $table->dropForeign(['order_id']);
        });
        Schema::table('payments', function (Blueprint $table) {
            $table->unsignedBigInteger('order_id')->nullable(false)->change();
            $table->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
        });

        Schema::table('customer_credit_ledger', function (Blueprint $table) {
            $table->dropUnique(['idempotency_key']);
            $table->dropColumn('idempotency_key');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->dropUnique(['idempotency_key']);
            $table->dropConstrainedForeignId('trade_account_id');
            $table->dropColumn(['idempotency_key', 'gst_period_key', 'gst_ledger_date']);
        });

        Schema::table('trade_deliveries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('mismatch_resolved_by');
            $table->dropConstrainedForeignId('missing_waived_by');
            $table->dropColumn([
                'mismatch_resolved_at',
                'mismatch_resolution_notes',
                'missing_charge_waived',
                'missing_waive_reason',
                'invoiced_at',
            ]);
        });

        Schema::dropIfExists('trade_invoice_allocations');
    }
};
