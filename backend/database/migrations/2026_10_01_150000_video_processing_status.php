<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Media audit, 2026-10-01: a video clip is converted in the background
 * instead of while the browser waits. These columns say whether a clip is
 * still converting, and why it failed when it did.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['item_photos', 'media_assets'] as $table) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            Schema::table($table, function (Blueprint $t) use ($table): void {
                if (!Schema::hasColumn($table, 'processing_status')) {
                    $t->string('processing_status', 20)->nullable()->index();
                }
                if (!Schema::hasColumn($table, 'processing_error')) {
                    $t->text('processing_error')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        foreach (['item_photos', 'media_assets'] as $table) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            Schema::table($table, function (Blueprint $t) use ($table): void {
                foreach (['processing_status', 'processing_error'] as $col) {
                    if (Schema::hasColumn($table, $col)) {
                        $t->dropColumn($col);
                    }
                }
            });
        }
    }
};
