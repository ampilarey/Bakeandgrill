<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('card_name', 120)->nullable()->after('name_dv');
            $table->string('card_name_dv', 120)->nullable()->after('card_name');
            $table->string('short_description', 140)->nullable()->after('description');
            $table->string('short_description_dv', 140)->nullable()->after('short_description');
            $table->string('price_note', 40)->nullable()->after('base_price');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn([
                'card_name',
                'card_name_dv',
                'short_description',
                'short_description_dv',
                'price_note',
            ]);
        });
    }
};
