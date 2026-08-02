<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // Hard exclude an item from the TV board without deactivating it.
            $table->boolean('show_on_signage')->default(true)->after('is_combo');
            // Force a showcase slide for an item with no photo and no discount.
            $table->boolean('is_signage_promoted')->default(false)->after('show_on_signage');

            $table->index('show_on_signage');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropIndex(['show_on_signage']);
            $table->dropColumn(['show_on_signage', 'is_signage_promoted']);
        });
    }
};
