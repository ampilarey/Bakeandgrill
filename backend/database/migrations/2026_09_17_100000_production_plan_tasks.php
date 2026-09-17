<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-09-17: "admin/manager assign and requests items that should
 * be made for tomorrow and assign time and staff to do that, so when he
 * prepares and cashier receives the amount it will be in the prepared list
 * and will be added to the stock."
 *
 * A saved plan line becomes a task: who makes it, by when, how much they
 * then made, and how much the counter took in. The batch the cook sends
 * remembers which plan line it was for, so receiving can write back.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('production_plan_records', function (Blueprint $table) {
            $table->foreignId('assigned_to')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            // "By half past six" — a clock time on the plan's day.
            $table->string('due_time', 5)->nullable()->after('assigned_to');
            $table->decimal('made_qty', 10, 2)->nullable()->after('due_time');
            $table->decimal('received_qty', 10, 2)->nullable()->after('made_qty');
            $table->timestamp('made_at')->nullable()->after('received_qty');
            $table->foreignId('made_by')->nullable()->after('made_at')->constrained('users')->nullOnDelete();
        });

        Schema::table('kitchen_production_items', function (Blueprint $table) {
            $table->foreignId('production_plan_record_id')
                ->nullable()
                ->after('kitchen_production_batch_id')
                ->constrained('production_plan_records')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('kitchen_production_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('production_plan_record_id');
        });

        Schema::table('production_plan_records', function (Blueprint $table) {
            $table->dropConstrainedForeignId('made_by');
            $table->dropConstrainedForeignId('assigned_to');
            $table->dropColumn(['due_time', 'made_qty', 'received_qty', 'made_at']);
        });
    }
};
