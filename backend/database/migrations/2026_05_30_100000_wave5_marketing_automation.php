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
        Schema::table('customers', function (Blueprint $table): void {
            $table->date('date_of_birth')->nullable()->after('email');
        });

        Schema::create('abandoned_carts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->uuid('cart_token')->unique();
            $table->json('items_json');
            $table->unsignedInteger('subtotal_laar')->default(0);
            $table->timestamp('snapshot_at');
            $table->timestamp('reminded_at')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'reminded_at']);
            $table->index('snapshot_at');
        });

        $now = now();
        $settings = [
            [
                'key' => 'marketing_birthday_enabled',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Marketing',
                'label' => 'Birthday offers enabled',
                'description' => 'Send birthday loyalty bonus + SMS to customers with DOB on file.',
                'is_public' => false,
            ],
            [
                'key' => 'marketing_birthday_points',
                'value' => '100',
                'type' => 'text',
                'group' => 'Marketing',
                'label' => 'Birthday bonus points',
                'description' => 'Loyalty points credited once per customer per year on their birthday.',
                'is_public' => false,
            ],
            [
                'key' => 'marketing_birthday_sms_template',
                'value' => 'Happy birthday from Bake & Grill! We added {points} loyalty points to your account. Order at {url}',
                'type' => 'textarea',
                'group' => 'Marketing',
                'label' => 'Birthday SMS template',
                'description' => 'Placeholders: {points}, {url}, {name}',
                'is_public' => false,
            ],
            [
                'key' => 'marketing_abandoned_cart_enabled',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Marketing',
                'label' => 'Abandoned cart SMS enabled',
                'description' => 'Send one recovery SMS per cart snapshot after the delay.',
                'is_public' => false,
            ],
            [
                'key' => 'marketing_abandoned_cart_delay_minutes',
                'value' => '60',
                'type' => 'text',
                'group' => 'Marketing',
                'label' => 'Abandoned cart delay (minutes)',
                'description' => 'Wait this long after snapshot before sending recovery SMS.',
                'is_public' => false,
            ],
            [
                'key' => 'marketing_abandoned_cart_sms_template',
                'value' => 'Bake & Grill: You left items in your cart. Finish your order: {url}',
                'type' => 'textarea',
                'group' => 'Marketing',
                'label' => 'Abandoned cart SMS template',
                'description' => 'Placeholders: {url}, {name}',
                'is_public' => false,
            ],
            [
                'key' => 'marketing_abandoned_cart_ttl_days',
                'value' => '7',
                'type' => 'text',
                'group' => 'Marketing',
                'label' => 'Abandoned cart retention (days)',
                'description' => 'Delete stale cart snapshots after this many days.',
                'is_public' => false,
            ],
        ];

        foreach ($settings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => $now, 'updated_at' => $now]),
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('abandoned_carts');

        Schema::table('customers', function (Blueprint $table): void {
            $table->dropColumn('date_of_birth');
        });

        DB::table('site_settings')->whereIn('key', [
            'marketing_birthday_enabled',
            'marketing_birthday_points',
            'marketing_birthday_sms_template',
            'marketing_abandoned_cart_enabled',
            'marketing_abandoned_cart_delay_minutes',
            'marketing_abandoned_cart_sms_template',
            'marketing_abandoned_cart_ttl_days',
        ])->delete();
    }
};
