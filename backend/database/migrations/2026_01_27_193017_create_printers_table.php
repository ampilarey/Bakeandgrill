<?php

declare(strict_types=1);

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
        Schema::create('printers', function (Blueprint $table) {
            $table->id();
            $table->string('name'); // e.g., "Kitchen Printer"
            $table->string('ip_address'); // e.g., "192.168.1.50"
            $table->integer('port')->default(9100);
            $table->string('type'); // kitchen, bar, counter, receipt
            $table->string('station')->nullable(); // e.g., "grill", "bar"
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->index('type');
            $table->index('is_active');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('printers');
    }
};
