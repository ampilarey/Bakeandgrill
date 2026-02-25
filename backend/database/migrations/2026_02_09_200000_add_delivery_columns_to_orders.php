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
            // Delivery address
            $table->string('delivery_address_line1')->nullable()->after('total_laar');
            $table->string('delivery_address_line2')->nullable()->after('delivery_address_line1');
            $table->string('delivery_island')->nullable()->after('delivery_address_line2');

            // Delivery contact
            $table->string('delivery_contact_name')->nullable()->after('delivery_island');
            $table->string('delivery_contact_phone')->nullable()->after('delivery_contact_name');
            $table->text('delivery_notes')->nullable()->after('delivery_contact_phone');

            // Delivery fee and ETA
            $table->decimal('delivery_fee', 10, 2)->default(0)->after('delivery_notes');
            $table->unsignedBigInteger('delivery_fee_laar')->default(0)->after('delivery_fee');
            $table->timestamp('delivery_eta_at')->nullable()->after('delivery_fee_laar');

            // Indexes for fleet/delivery dashboards
            $table->index(['type', 'delivery_eta_at'], 'orders_type_eta_idx');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropIndex('orders_type_eta_idx');
            $table->dropColumn([
                'delivery_address_line1',
                'delivery_address_line2',
                'delivery_island',
                'delivery_contact_name',
                'delivery_contact_phone',
                'delivery_notes',
                'delivery_fee',
                'delivery_fee_laar',
                'delivery_eta_at',
            ]);
        });
    }
};
