<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Tell me when it's back" and "coming soon" (iruali import plan, feature 8).
 * items.launch_at: the dish is kept off sale until then and goes on sale by
 * itself; item_alerts: customers waiting for a dish to come back or launch.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->timestamp('launch_at')->nullable()->after('snoozed_until');
        });
        Schema::create('item_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('kind', 10); // back | launch
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->unique(['item_id', 'customer_id']);
            $table->index(['sent_at', 'item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_alerts');
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('launch_at');
        });
    }
};
