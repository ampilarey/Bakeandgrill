<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Deleting a purchase order without losing it.
 *
 * Owner, 2026-09-06: "how to cancel/delete or edit the po, admin must be able
 * to do that." Nothing deleted a purchase order at all, so one raised by
 * mistake sat in the list for good.
 *
 * Soft, not hard. The owner wants it off the screen; an auditor wants to know
 * a document with that number once existed and who made it go away. Both are
 * reasonable and a `deleted_at` satisfies them at once, with the audit log
 * carrying the who and the when.
 *
 * Deliberately not cascaded to `purchase_items`: the lines hang off the
 * purchase and are only ever read through it, so a second timestamp would be
 * two places to keep in step for no gain.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchases', function (Blueprint $table): void {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('purchases', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });
    }
};
