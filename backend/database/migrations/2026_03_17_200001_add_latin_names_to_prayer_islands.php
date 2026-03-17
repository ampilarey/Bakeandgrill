<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prayer_islands', function (Blueprint $table) {
            $table->string('atoll_latin', 50)->nullable()->after('atoll');
            $table->string('name_latin', 100)->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('prayer_islands', function (Blueprint $table) {
            $table->dropColumn(['atoll_latin', 'name_latin']);
        });
    }
};
