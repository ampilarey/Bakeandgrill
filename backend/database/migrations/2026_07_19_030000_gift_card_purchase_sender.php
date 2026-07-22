<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('gift_card_purchases')) {
            return;
        }

        Schema::table('gift_card_purchases', function (Blueprint $table): void {
            if (!Schema::hasColumn('gift_card_purchases', 'sender_name')) {
                $table->string('sender_name', 80)->nullable()->after('personal_note');
            }
            if (!Schema::hasColumn('gift_card_purchases', 'send_anonymously')) {
                $table->boolean('send_anonymously')->default(false)->after('sender_name');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('gift_card_purchases')) {
            return;
        }

        Schema::table('gift_card_purchases', function (Blueprint $table): void {
            if (Schema::hasColumn('gift_card_purchases', 'send_anonymously')) {
                $table->dropColumn('send_anonymously');
            }
            if (Schema::hasColumn('gift_card_purchases', 'sender_name')) {
                $table->dropColumn('sender_name');
            }
        });
    }
};
