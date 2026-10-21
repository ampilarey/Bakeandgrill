<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Number stands for self-seating dine-in (owner, 2026-10-22: "here people
 * sit on their own"). A stand is a table row of kind "stand": the till gives
 * a dine-in ticket the next free number, the runner looks for the number
 * rather than a table, and the number is held until the order is served.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('restaurant_tables', function (Blueprint $table) {
            $table->string('kind', 16)->default('table')->after('name')->index();
        });
    }

    public function down(): void
    {
        Schema::table('restaurant_tables', function (Blueprint $table) {
            $table->dropIndex(['kind']);
            $table->dropColumn('kind');
        });
    }
};
