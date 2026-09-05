<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which items the floor may ask for.
 *
 * Staff request from a list rather than typing a name, and not everything in
 * inventory belongs on that list: a 25kg sack bought by the pallet, or a
 * warehouse line nobody at the counter should be ordering, is noise at best
 * and a wrong order at worst.
 *
 * Defaults to true so nothing vanishes from the list the day this ships —
 * the owner takes items off it deliberately, one at a time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->boolean('requestable')->default(true)->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn('requestable');
        });
    }
};
