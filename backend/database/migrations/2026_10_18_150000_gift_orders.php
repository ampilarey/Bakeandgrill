<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Gift orders (iruali import plan, feature 10). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->boolean('is_gift')->default(false);
            $table->string('gift_to_name', 100)->nullable();
            $table->string('gift_to_phone', 30)->nullable();
            $table->string('gift_message', 200)->nullable();
            $table->timestamp('gift_sms_sent_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['is_gift', 'gift_to_name', 'gift_to_phone', 'gift_message', 'gift_sms_sent_at']);
        });
    }
};
