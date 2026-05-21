<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Minutes of POS inactivity before auto-lock for this staff member.
            // NULL = venue default (5 min). 0 = never auto-lock.
            $table->unsignedTinyInteger('pos_idle_lock_minutes')->nullable()->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('pos_idle_lock_minutes');
        });
    }
};
