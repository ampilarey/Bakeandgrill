<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A hand-picked flag on an item: "Chef's picks" at the top of the menu.
 *
 * Owner, 2026-09-21: "Is there any specific category to show at the top of
 * the menu and order app?" There was not. The only thing above the first
 * category was the generated Offers strip, and the home page's "featured"
 * block was best sellers by count, not a choice. This flag is the choice:
 * ticked items appear in a section ahead of the categories on the website
 * menu and in the order app, and stay in their own category as well.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('items')) {
            return;
        }

        Schema::table('items', function (Blueprint $table) {
            if (!Schema::hasColumn('items', 'is_featured')) {
                $table->boolean('is_featured')->default(false)->after('is_signage_promoted');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('items') || !Schema::hasColumn('items', 'is_featured')) {
            return;
        }

        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('is_featured');
        });
    }
};
