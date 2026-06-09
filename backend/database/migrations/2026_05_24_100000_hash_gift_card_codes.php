<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gift_cards', function (Blueprint $table): void {
            $table->char('code_hash', 64)->nullable()->after('id');
            $table->string('code_last4', 8)->nullable()->after('code_hash');
        });

        Schema::table('orders', function (Blueprint $table): void {
            $table->foreignId('gift_card_id')->nullable()->after('gift_card_discount_laar')
                ->constrained('gift_cards')->nullOnDelete();
        });

        // Test server has no production gift cards — clear legacy plaintext data.
        DB::table('gift_card_transactions')->delete();
        DB::table('gift_cards')->delete();
        DB::table('orders')->update([
            'gift_card_code' => null,
            'gift_card_discount_laar' => 0,
            'gift_card_id' => null,
        ]);

        Schema::table('gift_cards', function (Blueprint $table): void {
            $table->dropUnique(['code']);
            $table->dropIndex(['code']);
            $table->dropColumn('code');
        });

        Schema::table('gift_cards', function (Blueprint $table): void {
            $table->char('code_hash', 64)->nullable(false)->unique()->change();
            $table->string('code_last4', 8)->nullable(false)->change();
        });

        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn('gift_card_code');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->string('gift_card_code', 20)->nullable()->after('promo_discount_laar');
            $table->dropConstrainedForeignId('gift_card_id');
        });

        Schema::table('gift_cards', function (Blueprint $table): void {
            $table->dropUnique(['code_hash']);
            $table->dropColumn(['code_hash', 'code_last4']);
            $table->string('code', 20)->unique()->after('id');
            $table->index('code');
        });
    }
};
