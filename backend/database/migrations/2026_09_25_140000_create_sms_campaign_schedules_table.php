<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recurring campaigns (SMS audit follow-up, 2026-09-24): a campaign that
 * runs itself — "We miss you" every Monday to whoever became dormant that
 * week — with a per-customer cooldown so nobody gets the same recipe
 * twice inside N days. Each run is an ordinary SmsCampaign that points
 * back at its schedule, so the results and the log read like any other.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_campaign_schedules', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 100);
            $table->text('message');
            $table->json('target_criteria');
            $table->string('recipe_key', 40)->nullable();
            $table->string('frequency', 10); // daily | weekly | monthly
            $table->json('days_of_week')->nullable(); // weekly: ['mon', 'thu']
            $table->unsignedTinyInteger('day_of_month')->nullable(); // monthly
            $table->time('send_time');
            $table->unsignedSmallInteger('cooldown_days')->default(30);
            $table->boolean('is_active')->default(true);
            $table->timestamp('next_run_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->unsignedInteger('runs_count')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['is_active', 'next_run_at']);
        });

        Schema::table('sms_campaigns', function (Blueprint $table): void {
            $table->foreignId('schedule_id')->nullable()->after('created_by')->constrained('sms_campaign_schedules')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sms_campaigns', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('schedule_id');
        });
        Schema::dropIfExists('sms_campaign_schedules');
    }
};
