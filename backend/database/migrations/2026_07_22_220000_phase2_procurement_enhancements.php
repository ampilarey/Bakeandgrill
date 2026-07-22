<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 2 procurement: settings, category budgets, recurring shopping lists.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('expense_categories') && !Schema::hasColumn('expense_categories', 'monthly_budget_laar')) {
            Schema::table('expense_categories', function (Blueprint $table) {
                $table->unsignedBigInteger('monthly_budget_laar')->nullable()->after('is_active');
            });
        }

        if (!Schema::hasTable('recurring_shopping_lists')) {
            Schema::create('recurring_shopping_lists', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->boolean('is_active')->default(true);
                $table->string('recurrence_interval', 32)->default('weekly');
                $table->date('next_run_date')->nullable();
                $table->string('priority', 16)->default('normal');
                $table->string('title_template')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('recurring_shopping_list_items')) {
            Schema::create('recurring_shopping_list_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('recurring_shopping_list_id')->constrained('recurring_shopping_lists')->cascadeOnDelete();
                $table->foreignId('inventory_item_id')->nullable()->constrained('inventory_items')->nullOnDelete();
                $table->string('free_text_name')->nullable();
                $table->decimal('qty', 12, 3);
                $table->string('unit', 32)->default('pcs');
                $table->unsignedBigInteger('estimated_unit_cost_laar')->nullable();
                $table->unsignedSmallInteger('sort')->default(0);
                $table->timestamps();
            });
        }

        $settings = [
            [
                'key' => 'purchase_requests_show_price_hints',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Purchase Requests',
                'label' => 'Show supplier price hints on buying lines',
                'description' => 'When on, PR/POS buying lines with a catalog item show last-paid and cheapest supplier prices.',
                'is_public' => false,
            ],
            [
                'key' => 'purchase_requests_auto_on_low_stock',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Purchase Requests',
                'label' => 'Auto-create restock PR on low stock',
                'description' => 'When on, newly created inventory reorder alerts generate a restock purchase request (below ROP only). Off by default.',
                'is_public' => false,
            ],
            [
                'key' => 'purchase_requests_auto_approve_under_laar',
                'value' => '0',
                'type' => 'text',
                'group' => 'Purchase Requests',
                'label' => 'Auto-approve under amount (laari)',
                'description' => 'If > 0 and total_estimated_laar is set and at/under this threshold, new PRs auto-approve. 0 = disabled.',
                'is_public' => false,
            ],
            [
                'key' => 'expense_budgets_enforce',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Expenses',
                'label' => 'Enforce expense category budgets',
                'description' => 'When off, over-budget is a warning only. When on, create/convert that would exceed the monthly cap is blocked.',
                'is_public' => false,
            ],
            [
                'key' => 'purchase_requests_recurring_lists_enabled',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Purchase Requests',
                'label' => 'Enable recurring shopping lists',
                'description' => 'Master switch for purchase-requests:generate-recurring-lists. Off by default.',
                'is_public' => false,
            ],
        ];

        foreach ($settings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()]),
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('recurring_shopping_list_items');
        Schema::dropIfExists('recurring_shopping_lists');

        if (Schema::hasTable('expense_categories') && Schema::hasColumn('expense_categories', 'monthly_budget_laar')) {
            Schema::table('expense_categories', function (Blueprint $table) {
                $table->dropColumn('monthly_budget_laar');
            });
        }

        DB::table('site_settings')->whereIn('key', [
            'purchase_requests_show_price_hints',
            'purchase_requests_auto_on_low_stock',
            'purchase_requests_auto_approve_under_laar',
            'expense_budgets_enforce',
            'purchase_requests_recurring_lists_enabled',
        ])->delete();
    }
};
