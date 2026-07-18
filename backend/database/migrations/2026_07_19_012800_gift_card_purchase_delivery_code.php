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
            if (!Schema::hasColumn('gift_card_purchases', 'delivery_code_encrypted')) {
                $table->text('delivery_code_encrypted')->nullable()->after('code_delivery_expires_at');
            }
            if (!Schema::hasColumn('gift_card_purchases', 'delivery_recovery_count')) {
                $table->unsignedTinyInteger('delivery_recovery_count')->default(0)->after('delivery_code_encrypted');
            }
        });
    }

    public function down(): void
    {
        Schema::table('gift_card_purchases', function (Blueprint $table): void {
            $cols = array_values(array_filter([
                Schema::hasColumn('gift_card_purchases', 'delivery_code_encrypted') ? 'delivery_code_encrypted' : null,
                Schema::hasColumn('gift_card_purchases', 'delivery_recovery_count') ? 'delivery_recovery_count' : null,
            ]));
            if ($cols !== []) {
                $table->dropColumn($cols);
            }
        });
    }
};
