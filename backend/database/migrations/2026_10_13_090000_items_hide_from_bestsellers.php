<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Owner, 2026-10-13: "Some items like water bottles are always in the best
 * sellers section but I don't want some items be there." A staple sells most
 * but needs no promoting: ticked, the item is left out of the website's Best
 * Sellers, the order app's Top sellers filter, the till's Popular now row and
 * the signage Bestsellers slide. Sales reports still count it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->boolean('hide_from_bestsellers')->default(false)->after('is_featured');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('hide_from_bestsellers');
        });
    }
};
