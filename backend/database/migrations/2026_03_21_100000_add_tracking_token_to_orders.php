<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('tracking_token', 16)->nullable()->unique()->after('order_number');
        });

        // Backfill existing orders
        DB::table('orders')->whereNull('tracking_token')->orderBy('id')->each(function ($order) {
            DB::table('orders')
                ->where('id', $order->id)
                ->update(['tracking_token' => Str::lower(Str::random(16))]);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('tracking_token', 16)->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('tracking_token');
        });
    }
};
