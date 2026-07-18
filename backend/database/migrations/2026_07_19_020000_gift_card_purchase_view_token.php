<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gift_card_purchases', function (Blueprint $table): void {
            if (!Schema::hasColumn('gift_card_purchases', 'view_token')) {
                $table->string('view_token', 64)->nullable()->unique()->after('delivery_recovery_count');
            }
        });
    }

    public function down(): void
    {
        Schema::table('gift_card_purchases', function (Blueprint $table): void {
            if (Schema::hasColumn('gift_card_purchases', 'view_token')) {
                $table->dropColumn('view_token');
            }
        });
    }
};
