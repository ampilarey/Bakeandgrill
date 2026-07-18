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
            $table->unsignedTinyInteger('resend_count')->default(0)->after('email_ok');
            $table->timestamp('last_resent_at')->nullable()->after('resend_count');
            $table->timestamp('code_delivery_expires_at')->nullable()->after('last_resent_at');
        });
    }

    public function down(): void
    {
        Schema::table('gift_card_purchases', function (Blueprint $table): void {
            $table->dropColumn(['resend_count', 'last_resent_at', 'code_delivery_expires_at']);
        });
    }
};
