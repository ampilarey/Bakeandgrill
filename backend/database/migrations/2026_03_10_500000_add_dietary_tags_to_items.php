<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->json('dietary_tags')->nullable()->after('description');
            $table->json('allergens')->nullable()->after('dietary_tags');
            $table->unsignedSmallInteger('calories')->nullable()->after('allergens');
            $table->unsignedSmallInteger('prep_time_minutes')->nullable()->after('calories');
            $table->enum('spice_level', ['none', 'mild', 'medium', 'hot', 'extra_hot'])->nullable()->after('prep_time_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->dropColumn(['dietary_tags', 'allergens', 'calories', 'prep_time_minutes', 'spice_level']);
        });
    }
};
