<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage D — trade invoicing, allocations, receivable payments, GST period stamp.
 * See docs/WHOLESALE_CONSIGNMENT_PLAN.md §3.5, §7, §8.
 *
 * Idempotent: TEST/prod may already have objects from a prior partial apply
 * without a migrations-table row (re-run must not fail on "already exists").
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('trade_invoice_allocations')) {
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
        }

        if (Schema::hasTable('trade_deliveries')) {
            $deliveryCols = [
                'mismatch_resolved_at',
                'mismatch_resolved_by',
                'mismatch_resolution_notes',
                'missing_charge_waived',
                'missing_waive_reason',
                'missing_waived_by',
                'invoiced_at',
            ];
            $needsDeliveryAlter = collect($deliveryCols)
                ->contains(fn (string $col) => ! Schema::hasColumn('trade_deliveries', $col));

            if ($needsDeliveryAlter) {
                Schema::table('trade_deliveries', function (Blueprint $table) {
                    if (! Schema::hasColumn('trade_deliveries', 'mismatch_resolved_at')) {
                        $table->timestamp('mismatch_resolved_at')->nullable()->after('has_mismatch');
                    }
                    if (! Schema::hasColumn('trade_deliveries', 'mismatch_resolved_by')) {
                        $table->foreignId('mismatch_resolved_by')->nullable()->after('mismatch_resolved_at')
                            ->constrained('users')->nullOnDelete();
                    }
                    if (! Schema::hasColumn('trade_deliveries', 'mismatch_resolution_notes')) {
                        $table->text('mismatch_resolution_notes')->nullable()->after('mismatch_resolved_by');
                    }
                    if (! Schema::hasColumn('trade_deliveries', 'missing_charge_waived')) {
                        $table->boolean('missing_charge_waived')->default(false)->after('mismatch_resolution_notes');
                    }
                    if (! Schema::hasColumn('trade_deliveries', 'missing_waive_reason')) {
                        $table->text('missing_waive_reason')->nullable()->after('missing_charge_waived');
                    }
                    if (! Schema::hasColumn('trade_deliveries', 'missing_waived_by')) {
                        $table->foreignId('missing_waived_by')->nullable()->after('missing_waive_reason')
                            ->constrained('users')->nullOnDelete();
                    }
                    if (! Schema::hasColumn('trade_deliveries', 'invoiced_at')) {
                        $table->timestamp('invoiced_at')->nullable()->after('reconciled_by');
                    }
                });
            }
        }

        if (Schema::hasTable('invoices')) {
            $invoiceCols = ['idempotency_key', 'trade_account_id', 'gst_period_key', 'gst_ledger_date'];
            $needsInvoiceAlter = collect($invoiceCols)
                ->contains(fn (string $col) => ! Schema::hasColumn('invoices', $col));

            if ($needsInvoiceAlter) {
                Schema::table('invoices', function (Blueprint $table) {
                    if (! Schema::hasColumn('invoices', 'idempotency_key')) {
                        $table->string('idempotency_key')->nullable()->unique()->after('token');
                    }
                    if (! Schema::hasColumn('invoices', 'trade_account_id')) {
                        $table->foreignId('trade_account_id')->nullable()->after('customer_id')
                            ->constrained('trade_accounts')->nullOnDelete();
                    }
                    if (! Schema::hasColumn('invoices', 'gst_period_key')) {
                        $table->string('gst_period_key', 16)->nullable()->after('issue_date');
                    }
                    if (! Schema::hasColumn('invoices', 'gst_ledger_date')) {
                        $table->date('gst_ledger_date')->nullable()->after('gst_period_key');
                    }
                });
            }
        }

        if (Schema::hasTable('customer_credit_ledger')
            && ! Schema::hasColumn('customer_credit_ledger', 'idempotency_key')) {
            Schema::table('customer_credit_ledger', function (Blueprint $table) {
                $table->string('idempotency_key')->nullable()->unique()->after('notes');
            });
        }

        // payments.order_id was NOT NULL — make nullable and add invoice_id.
        // Exactly one of order_id / invoice_id must be set (enforced in service + MySQL check).
        if (Schema::hasTable('payments')) {
            try {
                Schema::table('payments', function (Blueprint $table) {
                    $table->dropForeign(['order_id']);
                });
            } catch (\Throwable) {
                // FK name may differ across environments / already dropped.
            }

            $driver = Schema::getConnection()->getDriverName();
            if (in_array($driver, ['mysql', 'mariadb'], true)) {
                try {
                    DB::statement('ALTER TABLE payments MODIFY order_id BIGINT UNSIGNED NULL');
                } catch (\Throwable) {
                    // already nullable
                }
            } elseif ($driver === 'pgsql') {
                try {
                    DB::statement('ALTER TABLE payments ALTER COLUMN order_id DROP NOT NULL');
                } catch (\Throwable) {
                    // already nullable
                }
            } else {
                try {
                    Schema::table('payments', function (Blueprint $table) {
                        $table->unsignedBigInteger('order_id')->nullable()->change();
                    });
                } catch (\Throwable) {
                    // ignore
                }
            }

            // Re-add order_id FK (nullOnDelete) if missing; add invoice_id if missing.
            try {
                Schema::table('payments', function (Blueprint $table) {
                    $table->foreign('order_id')->references('id')->on('orders')->nullOnDelete();
                });
            } catch (\Throwable) {
                // already present
            }

            if (! Schema::hasColumn('payments', 'invoice_id')) {
                Schema::table('payments', function (Blueprint $table) {
                    $table->foreignId('invoice_id')->nullable()->after('order_id')
                        ->constrained('invoices')->nullOnDelete();
                    $table->index('invoice_id');
                });
            }

            if (in_array($driver, ['mysql', 'mariadb'], true)) {
                try {
                    DB::statement('ALTER TABLE payments ADD CONSTRAINT payments_order_xor_invoice_chk CHECK (
                        (order_id IS NOT NULL AND invoice_id IS NULL) OR (order_id IS NULL AND invoice_id IS NOT NULL)
                    )');
                } catch (\Throwable) {
                    // constraint already exists
                }
            }
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

        if (Schema::hasTable('payments') && Schema::hasColumn('payments', 'invoice_id')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->dropForeign(['invoice_id']);
                $table->dropColumn('invoice_id');
                try {
                    $table->dropForeign(['order_id']);
                } catch (\Throwable) {
                    // ignore
                }
            });
            Schema::table('payments', function (Blueprint $table) {
                $table->unsignedBigInteger('order_id')->nullable(false)->change();
                $table->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
            });
        }

        if (Schema::hasTable('customer_credit_ledger')
            && Schema::hasColumn('customer_credit_ledger', 'idempotency_key')) {
            Schema::table('customer_credit_ledger', function (Blueprint $table) {
                $table->dropUnique(['idempotency_key']);
                $table->dropColumn('idempotency_key');
            });
        }

        if (Schema::hasTable('invoices') && Schema::hasColumn('invoices', 'trade_account_id')) {
            Schema::table('invoices', function (Blueprint $table) {
                if (Schema::hasColumn('invoices', 'idempotency_key')) {
                    $table->dropUnique(['idempotency_key']);
                }
                $table->dropConstrainedForeignId('trade_account_id');
                $drop = array_values(array_filter([
                    Schema::hasColumn('invoices', 'idempotency_key') ? 'idempotency_key' : null,
                    Schema::hasColumn('invoices', 'gst_period_key') ? 'gst_period_key' : null,
                    Schema::hasColumn('invoices', 'gst_ledger_date') ? 'gst_ledger_date' : null,
                ]));
                if ($drop !== []) {
                    $table->dropColumn($drop);
                }
            });
        }

        if (Schema::hasTable('trade_deliveries') && Schema::hasColumn('trade_deliveries', 'invoiced_at')) {
            Schema::table('trade_deliveries', function (Blueprint $table) {
                if (Schema::hasColumn('trade_deliveries', 'mismatch_resolved_by')) {
                    $table->dropConstrainedForeignId('mismatch_resolved_by');
                }
                if (Schema::hasColumn('trade_deliveries', 'missing_waived_by')) {
                    $table->dropConstrainedForeignId('missing_waived_by');
                }
                $drop = array_values(array_filter([
                    Schema::hasColumn('trade_deliveries', 'mismatch_resolved_at') ? 'mismatch_resolved_at' : null,
                    Schema::hasColumn('trade_deliveries', 'mismatch_resolution_notes') ? 'mismatch_resolution_notes' : null,
                    Schema::hasColumn('trade_deliveries', 'missing_charge_waived') ? 'missing_charge_waived' : null,
                    Schema::hasColumn('trade_deliveries', 'missing_waive_reason') ? 'missing_waive_reason' : null,
                    Schema::hasColumn('trade_deliveries', 'invoiced_at') ? 'invoiced_at' : null,
                ]));
                if ($drop !== []) {
                    $table->dropColumn($drop);
                }
            });
        }

        Schema::dropIfExists('trade_invoice_allocations');
    }
};
