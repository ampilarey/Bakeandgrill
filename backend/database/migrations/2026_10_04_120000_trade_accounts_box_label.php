<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * A shop's box label in one place (owner, 2026-10-04: "Cant u add all in one
 * place?"): who it goes to, the boat, pick-up point and window, and the
 * shop's own item list with the article names it checks boxes against.
 * One JSON column; nothing else reads it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trade_accounts', function (Blueprint $table) {
            $table->json('box_label')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('trade_accounts', function (Blueprint $table) {
            $table->dropColumn('box_label');
        });
    }
};
