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
            if (!Schema::hasColumn('orders', 'offline_local_number')) {
                $table->string('offline_local_number', 64)->nullable()->after('offline_id');
                $table->index('offline_local_number');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            if (Schema::hasColumn('orders', 'offline_local_number')) {
                $table->dropIndex(['offline_local_number']);
                $table->dropColumn('offline_local_number');
            }
        });
    }
};
