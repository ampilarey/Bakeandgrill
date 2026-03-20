<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->string('guest_phone', 20)->nullable()->after('customer_id');
            $table->string('guest_name', 100)->nullable()->after('guest_phone');
            $table->string('guest_email', 150)->nullable()->after('guest_name');
            $table->string('guest_token', 64)->nullable()->unique()->after('guest_email');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn(['guest_phone', 'guest_name', 'guest_email', 'guest_token']);
        });
    }
};
