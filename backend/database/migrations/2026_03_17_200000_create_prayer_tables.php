<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prayer_categories', function (Blueprint $table) {
            $table->unsignedSmallInteger('id')->primary();
        });

        Schema::create('prayer_islands', function (Blueprint $table) {
            $table->unsignedSmallInteger('id')->primary();
            $table->unsignedSmallInteger('category_id')->index();
            $table->string('atoll', 20);
            $table->string('name', 100);
            $table->smallInteger('offset_minutes')->default(0);
            $table->decimal('latitude', 9, 6)->nullable();
            $table->decimal('longitude', 9, 6)->nullable();
            $table->boolean('is_active')->default(true);

            $table->foreign('category_id')->references('id')->on('prayer_categories');
        });

        Schema::create('prayer_times', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('category_id')->index();
            $table->unsignedSmallInteger('day_of_year');
            $table->unsignedSmallInteger('fajr');
            $table->unsignedSmallInteger('sunrise');
            $table->unsignedSmallInteger('dhuhr');
            $table->unsignedSmallInteger('asr');
            $table->unsignedSmallInteger('maghrib');
            $table->unsignedSmallInteger('isha');

            $table->unique(['category_id', 'day_of_year']);
            $table->foreign('category_id')->references('id')->on('prayer_categories');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prayer_times');
        Schema::dropIfExists('prayer_islands');
        Schema::dropIfExists('prayer_categories');
    }
};
