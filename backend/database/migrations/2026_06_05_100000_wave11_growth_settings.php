<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('corporate_inquiries')) {
            Schema::create('corporate_inquiries', function (Blueprint $table) {
                $table->id();
                $table->string('company')->nullable();
                $table->string('contact_name');
                $table->string('phone', 32);
                $table->string('email')->nullable();
                $table->date('event_date')->nullable();
                $table->unsignedSmallInteger('headcount')->nullable();
                $table->text('notes')->nullable();
                $table->string('status', 32)->default('new');
                $table->timestamps();
            });
        }

        $rows = [
            [
                'key' => 'google_analytics_id',
                'value' => '',
                'type' => 'text',
                'group' => 'Analytics',
                'label' => 'Google Analytics 4 Measurement ID',
                'description' => 'e.g. G-XXXXXXXXXX — injected on public site and order app when set',
                'is_public' => true,
            ],
            [
                'key' => 'google_tag_manager_id',
                'value' => '',
                'type' => 'text',
                'group' => 'Analytics',
                'label' => 'Google Tag Manager container ID',
                'description' => 'e.g. GTM-XXXXXXX — optional; used instead of GA when set',
                'is_public' => true,
            ],
            [
                'key' => 'office_orders_enabled',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Homepage',
                'label' => 'Show office / catering inquiry section',
                'description' => 'Displays corporate ordering block on the online order homepage',
                'is_public' => true,
            ],
            [
                'key' => 'office_orders_headline',
                'value' => 'Office breakfast & team catering',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Office orders headline',
                'description' => 'Headline for the corporate inquiry section',
                'is_public' => true,
            ],
            [
                'key' => 'office_orders_subtext',
                'value' => 'Minimum 10 guests. We deliver across Malé — tell us your date and headcount.',
                'type' => 'textarea',
                'group' => 'Homepage',
                'label' => 'Office orders subtext',
                'description' => 'Supporting copy under the headline',
                'is_public' => true,
            ],
            [
                'key' => 'office_orders_min_guests',
                'value' => '10',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Minimum guests for office orders',
                'description' => 'Shown in form validation hint',
                'is_public' => true,
            ],
        ];

        foreach ($rows as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()])
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('corporate_inquiries');
        DB::table('site_settings')->whereIn('key', [
            'google_analytics_id',
            'google_tag_manager_id',
            'office_orders_enabled',
            'office_orders_headline',
            'office_orders_subtext',
            'office_orders_min_guests',
        ])->delete();
    }
};
