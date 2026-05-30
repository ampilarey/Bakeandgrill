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
            if (!Schema::hasColumn('orders', 'kitchen_done_at')) {
                $table->timestamp('kitchen_done_at')->nullable()->after('completed_at');
            }
            if (!Schema::hasColumn('orders', 'kitchen_done_by')) {
                $table->foreignId('kitchen_done_by')->nullable()->after('kitchen_done_at')->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            if (Schema::hasColumn('orders', 'kitchen_done_by')) {
                $table->dropConstrainedForeignId('kitchen_done_by');
            }
            if (Schema::hasColumn('orders', 'kitchen_done_at')) {
                $table->dropColumn('kitchen_done_at');
            }
        });
    }
};
