<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Scan to reprint (round 11 of the labels usability work, owner, 2026-10-13:
 * "scan a pack's QR with the phone and reprint that exact label"): every
 * sticker print keeps the request that made it, narrowed to its own product,
 * so the code on a pack opens Print labels on that very label.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('label_prints', function (Blueprint $table): void {
            $table->json('request')->nullable()->after('details');
        });
    }

    public function down(): void
    {
        Schema::table('label_prints', function (Blueprint $table): void {
            $table->dropColumn('request');
        });
    }
};
