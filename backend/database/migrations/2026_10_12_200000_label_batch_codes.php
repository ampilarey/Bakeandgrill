<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Labels, 2026-10-12 (owner: "All" of the advanced features): every print
 * gets a short code that the sticker carries as a QR and that opens the
 * pack's public page (/b/{code}); and the print log remembers which
 * expiring stock the owner has already been told about.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('label_prints', function (Blueprint $table): void {
            $table->string('code', 12)->nullable()->unique()->after('id');
            $table->timestamp('expiry_alerted_at')->nullable()->after('exp_date');
            $table->index('exp_date');
        });
    }

    public function down(): void
    {
        Schema::table('label_prints', function (Blueprint $table): void {
            $table->dropIndex(['exp_date']);
            $table->dropUnique(['code']);
            $table->dropColumn(['code', 'expiry_alerted_at']);
        });
    }
};
