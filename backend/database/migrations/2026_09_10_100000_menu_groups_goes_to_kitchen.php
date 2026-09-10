<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether a menu group is something the kitchen has to make.
 *
 * Owner, 2026-09-09: "https://bakeandgrill.mv/admin/kds still kds in admin
 * panel not solved, the items that are shown in this is already prepared
 * items, sold and paid via pos" — then, on a board of 77: "this page should
 * show only the items that are active orders".
 *
 * The cause is one default. `OrderCreationService` fires an order to the
 * kitchen unless the caller explicitly passes `print: false`, and POS never
 * does — so a customer pointing at a bun on the counter, paying and walking
 * out prints a kitchen chit and puts a ticket on the board. Nobody ever bumps
 * it, because nothing was ever cooked. They pile up until the board is a
 * record of everything sold rather than a list of what to make.
 *
 * Menu group is the right place for the answer: it is already the axis the
 * kitchen display filters by (`line.menu_group_id === stationFilter`), so a
 * group is in practice already a station. Counter groups — buns, packaged
 * drinks — go off; the ones cooked to order stay on.
 *
 * Defaults to true, which is exactly today's behaviour, so nothing changes
 * anywhere until somebody unticks a group they know is sold off the shelf.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_groups', function (Blueprint $table) {
            $table->boolean('goes_to_kitchen')->default(true)->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('menu_groups', function (Blueprint $table) {
            $table->dropColumn('goes_to_kitchen');
        });
    }
};
