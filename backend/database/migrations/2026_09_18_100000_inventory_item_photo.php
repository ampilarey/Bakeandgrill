<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-09-18: "is there any option to add inventory item photo -
 * not brand". There was not: the only picture an ingredient could carry
 * hung off a brand. This is the item's own — what the thing itself looks
 * like, whatever packet it came in — for the stock list, the kitchen's
 * request and receiving screens, the buying list and the recipe editor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->string('photo_path')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn('photo_path');
        });
    }
};
