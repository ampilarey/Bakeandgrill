<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('catering_request_lines', function (Blueprint $table) {
            $table->foreignId('packaging_option_id')
                ->nullable()
                ->after('variant_id')
                ->constrained('item_packaging_options')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('catering_request_lines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('packaging_option_id');
        });
    }
};
