<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who actually bought this line.
 *
 * The request records who it was assigned to, which is not the same person:
 * anyone with `purchase_requests.view_all` can mark a line bought without
 * being the assignee, and often does. Until now nothing recorded which of them
 * spent the money.
 *
 * It matters from today, because accepting a delivery moves to the floor and
 * the person who bought something must not be the person who confirms it
 * arrived — the same separation refunds and stock counts already have. That
 * rule needs a name to compare against, and the assignee is the wrong one.
 *
 * Null on every existing row: those were bought before anyone was recorded, so
 * the guard cannot know and lets them through rather than blocking a delivery
 * on a fact nobody captured.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_request_items', function (Blueprint $table) {
            $table->foreignId('bought_by')->nullable()->after('supplier_name_text')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('purchase_request_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('bought_by');
        });
    }
};
