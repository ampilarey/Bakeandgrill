<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('printers') || !Schema::hasColumn('print_jobs', 'printer_id')) {
            return;
        }

        Schema::table('print_jobs', function (Blueprint $table) {
            $table->foreign('printer_id')
                ->references('id')
                ->on('printers')
                ->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('print_jobs') || !Schema::hasColumn('print_jobs', 'printer_id')) {
            return;
        }

        Schema::table('print_jobs', function (Blueprint $table) {
            $table->dropForeign(['printer_id']);
        });
    }
};
