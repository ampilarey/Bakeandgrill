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
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->string('phone')->unique();
            $table->string('email')->nullable();
            $table->integer('loyalty_points')->default(0);
            $table->string('tier')->default('bronze');
            $table->json('preferences')->nullable(); // Allergies, regular orders, etc.
            $table->string('preferred_language', 5)->default('en'); // en, dv, ar
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_login_at')->nullable();
            $table->timestamp('last_order_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('phone');
            $table->index('tier');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
