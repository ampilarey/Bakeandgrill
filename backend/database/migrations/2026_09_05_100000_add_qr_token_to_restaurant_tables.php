<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * A per-table token for the QR code on the table.
 *
 * Deliberately not the table id. A QR that read `?table=4` would invite
 * `?table=5`: someone at table 4 could send their order — and the kitchen
 * chit — to another party's table, and print a sheet of every table's code by
 * counting. A random token is not guessable, and can be rotated for one table
 * (a stolen or photographed card) without disturbing the rest of the floor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('restaurant_tables', function (Blueprint $table) {
            $table->string('qr_token', 32)->nullable()->unique()->after('is_active');
        });

        // Existing tables get one immediately: a null token would make the QR
        // feature quietly do nothing on every table that predates it.
        foreach (DB::table('restaurant_tables')->select('id')->get() as $row) {
            DB::table('restaurant_tables')
                ->where('id', $row->id)
                ->update(['qr_token' => Str::lower(Str::random(24))]);
        }
    }

    public function down(): void
    {
        Schema::table('restaurant_tables', function (Blueprint $table) {
            $table->dropUnique(['qr_token']);
            $table->dropColumn('qr_token');
        });
    }
};
