<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reservation_settings', function (Blueprint $table): void {
            $table->id();
            $table->unsignedSmallInteger('slot_duration_minutes')->default(60);
            $table->unsignedSmallInteger('max_party_size')->default(10);
            $table->unsignedSmallInteger('advance_booking_days')->default(30);
            $table->unsignedSmallInteger('buffer_minutes_between')->default(15);
            $table->unsignedSmallInteger('auto_cancel_minutes')->default(15);
            $table->timestamps();
        });

        // Insert default settings row
        DB::table('reservation_settings')->insert([
            'slot_duration_minutes'  => 60,
            'max_party_size'         => 10,
            'advance_booking_days'   => 30,
            'buffer_minutes_between' => 15,
            'auto_cancel_minutes'    => 15,
            'created_at'             => now(),
            'updated_at'             => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('reservation_settings');
    }
};
