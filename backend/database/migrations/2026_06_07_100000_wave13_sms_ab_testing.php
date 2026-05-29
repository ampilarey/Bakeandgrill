<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sms_campaigns', function (Blueprint $table): void {
            $table->boolean('ab_test_enabled')->default(false)->after('message');
            $table->text('message_variant_b')->nullable()->after('ab_test_enabled');
            $table->unsignedTinyInteger('ab_split_percent')->default(50)->after('message_variant_b');
        });

        Schema::table('sms_campaign_recipients', function (Blueprint $table): void {
            $table->char('variant', 1)->default('a')->after('name');
            $table->index(['campaign_id', 'variant', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('sms_campaign_recipients', function (Blueprint $table): void {
            $table->dropIndex(['campaign_id', 'variant', 'status']);
            $table->dropColumn('variant');
        });

        Schema::table('sms_campaigns', function (Blueprint $table): void {
            $table->dropColumn(['ab_test_enabled', 'message_variant_b', 'ab_split_percent']);
        });
    }
};
