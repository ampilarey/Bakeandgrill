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
        // Migrate existing guest orders: link to matching customer by phone.
        // Uses a correlated subquery so the statement works on both MySQL and SQLite.
        DB::statement('
            UPDATE orders
            SET customer_id = (
                SELECT id FROM customers
                WHERE customers.phone = orders.guest_phone
                LIMIT 1
            )
            WHERE customer_id IS NULL
              AND guest_phone IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM customers
                WHERE customers.phone = orders.guest_phone
              )
        ');

        // Drop the unique index before dropping the column — required for SQLite compatibility.
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropUnique('orders_guest_token_unique');
            $table->dropColumn(['guest_phone', 'guest_name', 'guest_email', 'guest_token']);
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->string('guest_phone', 20)->nullable()->after('customer_id');
            $table->string('guest_name', 100)->nullable()->after('guest_phone');
            $table->string('guest_email', 150)->nullable()->after('guest_name');
            $table->string('guest_token', 64)->nullable()->unique()->after('guest_email');
        });
    }
};
