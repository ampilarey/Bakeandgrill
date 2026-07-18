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
            $table->boolean('sms_ok')->nullable()->after('gift_card_id');
            $table->boolean('email_ok')->nullable()->after('sms_ok');
        });
    }

    public function down(): void
    {
        Schema::table('gift_card_purchases', function (Blueprint $table): void {
            $table->dropColumn(['sms_ok', 'email_ok']);
        });
    }
};
