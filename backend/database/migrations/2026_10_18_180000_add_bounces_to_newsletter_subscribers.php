<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Addresses that bounce stop getting the newsletter (App\Domains\Newsletter\Bounces). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('newsletter_subscribers', function (Blueprint $table): void {
            $table->unsignedSmallInteger('bounce_count')->default(0)->after('unsubscribed_at');
            $table->timestamp('bounced_at')->nullable()->after('bounce_count');
            $table->string('bounce_reason', 255)->nullable()->after('bounced_at');
        });
    }

    public function down(): void
    {
        Schema::table('newsletter_subscribers', function (Blueprint $table): void {
            $table->dropColumn(['bounce_count', 'bounced_at', 'bounce_reason']);
        });
    }
};
