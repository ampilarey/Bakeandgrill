<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fingerprint and palm clocks (ZKTeco, ADMS push) on the time clock: the clocks the
 * owner allowed, every punch they sent, and each staff member's number on the clock.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clock_devices', function (Blueprint $table) {
            $table->id();
            $table->string('serial', 40)->unique();
            $table->string('name', 80)->nullable();
            $table->string('model', 60)->nullable();
            // A clock that asked to connect waits here until someone allows it.
            $table->timestamp('allowed_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->string('last_ip', 45)->nullable();
            // The clock's own upload stamp, handed back so it sends only what is new.
            $table->string('att_stamp', 40)->nullable();
            // Number => name of the people enrolled on the clock, as it reports them.
            $table->json('device_users')->nullable();
            $table->timestamps();
        });

        Schema::create('clock_device_punches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clock_device_id')->constrained('clock_devices')->cascadeOnDelete();
            $table->string('device_user_no', 20);
            $table->dateTime('punched_at');
            $table->unsignedSmallInteger('state')->nullable();
            $table->unsignedSmallInteger('verify')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('time_punch_id')->nullable()->constrained('time_punches')->nullOnDelete();
            // in, out, double (a second scan within two minutes), early (before the clock was allowed)
            $table->string('result', 12)->nullable();
            $table->timestamps();

            $table->unique(['clock_device_id', 'device_user_no', 'punched_at'], 'clock_punch_once');
            $table->index(['device_user_no', 'user_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->string('clock_user_no', 20)->nullable()->unique()->after('pin_hash');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['clock_user_no']);
            $table->dropColumn('clock_user_no');
        });
        Schema::dropIfExists('clock_device_punches');
        Schema::dropIfExists('clock_devices');
    }
};
