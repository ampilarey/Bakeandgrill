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
        Schema::table('abandoned_carts', function (Blueprint $table): void {
            if (!Schema::hasColumn('abandoned_carts', 'phone')) {
                $table->string('phone', 32)->nullable()->after('customer_id');
            }
        });

        // Allow guest snapshots without a customer row.
        try {
            Schema::table('abandoned_carts', function (Blueprint $table): void {
                $table->dropForeign(['customer_id']);
            });
        } catch (\Throwable) {
            // FK name may differ across environments.
        }

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE abandoned_carts MODIFY customer_id BIGINT UNSIGNED NULL');
        } else {
            Schema::table('abandoned_carts', function (Blueprint $table): void {
                $table->unsignedBigInteger('customer_id')->nullable()->change();
            });
        }

        Schema::table('abandoned_carts', function (Blueprint $table): void {
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->index(['phone', 'reminded_at']);
        });

        // Align CMS defaults with BML-only online checkout (no COD).
        DB::table('site_settings')->where('key', 'home_delivery_payment_line')->update([
            'value' => 'Secure BML online payment at checkout',
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        try {
            Schema::table('abandoned_carts', function (Blueprint $table): void {
                $table->dropForeign(['customer_id']);
            });
        } catch (\Throwable) {
        }

        Schema::table('abandoned_carts', function (Blueprint $table): void {
            if (Schema::hasColumn('abandoned_carts', 'phone')) {
                $table->dropColumn('phone');
            }
        });

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE abandoned_carts MODIFY customer_id BIGINT UNSIGNED NOT NULL');
        } else {
            Schema::table('abandoned_carts', function (Blueprint $table): void {
                $table->unsignedBigInteger('customer_id')->nullable(false)->change();
            });
        }

        Schema::table('abandoned_carts', function (Blueprint $table): void {
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });
    }
};
