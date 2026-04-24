<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Extends delivery_drivers for driver app auth and vehicle info.
 * Creates driver_locations for GPS tracking.
 * Adds picked_up_at / delivered_at to orders for delivery timing stats.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── Extend delivery_drivers ──────────────────────────────────────────
        Schema::table('delivery_drivers', function (Blueprint $table): void {
            if (!Schema::hasColumn('delivery_drivers', 'pin')) {
                $table->string('pin')->nullable()->after('is_active');
            }
            if (!Schema::hasColumn('delivery_drivers', 'vehicle_type')) {
                $table->string('vehicle_type', 30)->nullable()->after('pin');
            }
            if (!Schema::hasColumn('delivery_drivers', 'last_login_at')) {
                $table->timestamp('last_login_at')->nullable()->after('vehicle_type');
            }
        });

        // ── driver_locations ────────────────────────────────────────────────
        if (!Schema::hasTable('driver_locations')) {
            Schema::create('driver_locations', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('delivery_driver_id')->constrained()->cascadeOnDelete();
                $table->decimal('latitude', 10, 7);
                $table->decimal('longitude', 10, 7);
                $table->float('heading')->nullable();
                $table->float('speed')->nullable();
                $table->float('accuracy')->nullable();
                $table->timestamp('recorded_at');
                $table->timestamp('created_at')->useCurrent();

                $table->index(['delivery_driver_id', 'recorded_at']);
            });
        }

        // ── orders timing columns ────────────────────────────────────────────
        Schema::table('orders', function (Blueprint $table): void {
            if (!Schema::hasColumn('orders', 'picked_up_at')) {
                $table->timestamp('picked_up_at')->nullable()->after('driver_assigned_at');
            }
            if (!Schema::hasColumn('orders', 'delivered_at')) {
                $table->timestamp('delivered_at')->nullable()->after('picked_up_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn(['picked_up_at', 'delivered_at']);
        });

        Schema::dropIfExists('driver_locations');

        Schema::table('delivery_drivers', function (Blueprint $table): void {
            $table->dropColumn(['pin', 'vehicle_type', 'last_login_at']);
        });
    }
};
