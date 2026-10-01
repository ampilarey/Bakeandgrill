<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gift card audit, 2026-10-01: a card issued or topped up from the admin
 * panel now records how it was paid for (cash, card, bank transfer or
 * complimentary) and who did it. Before, there was no way to tell a sold
 * card from a free one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gift_card_transactions', function (Blueprint $table): void {
            if (!Schema::hasColumn('gift_card_transactions', 'paid_by')) {
                $table->string('paid_by', 20)->nullable()->after('type');
            }
            if (!Schema::hasColumn('gift_card_transactions', 'reference')) {
                $table->string('reference', 100)->nullable()->after('paid_by');
            }
            if (!Schema::hasColumn('gift_card_transactions', 'user_id')) {
                $table->foreignId('user_id')->nullable()->after('reference')->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('gift_card_transactions', function (Blueprint $table): void {
            if (Schema::hasColumn('gift_card_transactions', 'user_id')) {
                $table->dropConstrainedForeignId('user_id');
            }
            foreach (['reference', 'paid_by'] as $col) {
                if (Schema::hasColumn('gift_card_transactions', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
