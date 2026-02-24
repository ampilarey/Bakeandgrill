<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('delivery_address')->nullable()->after('email');
            $table->string('delivery_area')->nullable()->after('delivery_address');
            $table->string('delivery_building')->nullable()->after('delivery_area');
            $table->string('delivery_floor')->nullable()->after('delivery_building');
            $table->text('delivery_notes')->nullable()->after('delivery_floor');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'delivery_address',
                'delivery_area',
                'delivery_building',
                'delivery_floor',
                'delivery_notes',
            ]);
        });
    }
};
