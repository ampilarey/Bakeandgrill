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
        Schema::table('catering_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('catering_requests', 'customer_id')) {
                $table->foreignId('customer_id')->nullable()->after('id')
                    ->constrained('customers')->nullOnDelete();
            }
            if (!Schema::hasColumn('catering_requests', 'reference')) {
                $table->string('reference', 32)->nullable()->unique()->after('customer_id');
            }
            if (!Schema::hasColumn('catering_requests', 'event_type')) {
                $table->string('event_type', 80)->nullable()->after('occasion');
            }
            if (!Schema::hasColumn('catering_requests', 'fulfillment_method')) {
                $table->string('fulfillment_method', 20)->default('pickup')->after('event_date');
            }
            if (!Schema::hasColumn('catering_requests', 'fulfillment_time')) {
                $table->time('fulfillment_time')->nullable()->after('fulfillment_method');
            }
            if (!Schema::hasColumn('catering_requests', 'setup_time')) {
                $table->time('setup_time')->nullable()->after('fulfillment_time');
            }
            if (!Schema::hasColumn('catering_requests', 'venue_name')) {
                $table->string('venue_name', 160)->nullable()->after('setup_time');
            }
            if (!Schema::hasColumn('catering_requests', 'delivery_address')) {
                $table->string('delivery_address', 500)->nullable()->after('venue_name');
            }
            if (!Schema::hasColumn('catering_requests', 'delivery_island')) {
                $table->string('delivery_island', 80)->nullable()->after('delivery_address');
            }
            if (!Schema::hasColumn('catering_requests', 'onsite_contact_name')) {
                $table->string('onsite_contact_name', 120)->nullable()->after('delivery_island');
            }
            if (!Schema::hasColumn('catering_requests', 'onsite_contact_phone')) {
                $table->string('onsite_contact_phone', 32)->nullable()->after('onsite_contact_name');
            }
            if (!Schema::hasColumn('catering_requests', 'dietary_notes')) {
                $table->string('dietary_notes', 1000)->nullable()->after('notes');
            }
            if (!Schema::hasColumn('catering_requests', 'fulfillment_options')) {
                $table->json('fulfillment_options')->nullable()->after('dietary_notes');
            }
        });

        if (Schema::hasTable('catering_requests')
            && !Schema::hasIndex('catering_requests', 'catering_requests_event_date_status_index')) {
            Schema::table('catering_requests', function (Blueprint $table) {
                $table->index(['event_date', 'status'], 'catering_requests_event_date_status_index');
            });
        }

        if (!Schema::hasTable('catering_request_lines')) {
            Schema::create('catering_request_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('catering_request_id')->constrained('catering_requests')->cascadeOnDelete();
                $table->foreignId('item_id')->nullable()->constrained('items')->nullOnDelete();
                $table->unsignedBigInteger('variant_id')->nullable();
                $table->string('name', 160);
                $table->unsignedInteger('quantity');
                $table->decimal('unit_price', 10, 2)->nullable();
                $table->string('notes', 500)->nullable();
                $table->boolean('is_custom')->default(false);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();

                $table->foreign('variant_id')->references('id')->on('variants')->nullOnDelete();
            });
        }

        Schema::table('otp_verifications', function (Blueprint $table) {
            if (!Schema::hasColumn('otp_verifications', 'channel')) {
                $table->string('channel', 16)->default('sms')->after('phone');
            }
            if (!Schema::hasColumn('otp_verifications', 'email')) {
                $table->string('email', 190)->nullable()->after('channel');
            }
        });

        $now = now();
        foreach ([
            [
                'key' => 'catering_notify_email',
                'value' => '',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Catering staff notify email',
                'description' => 'Email alert when an event/catering request is submitted (Phase 2+)',
                'is_public' => false,
            ],
            [
                'key' => 'events_section_headline',
                'value' => 'Events & Catering',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Events section headline',
                'description' => 'Homepage Events & Catering section title',
                'is_public' => true,
            ],
            [
                'key' => 'events_section_blurb',
                'value' => 'Plan office breakfasts, celebrations, and catering trays with a structured quote — not just a same-day order.',
                'type' => 'textarea',
                'group' => 'Homepage',
                'label' => 'Events section blurb',
                'description' => 'Homepage Events & Catering supporting copy',
                'is_public' => true,
            ],
            [
                'key' => 'events_section_browse_cta',
                'value' => 'Browse catering menu',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Events browse CTA label',
                'description' => 'Links to the catering menu / inquiry',
                'is_public' => true,
            ],
            [
                'key' => 'events_section_plan_cta',
                'value' => 'Plan your event',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Events plan CTA label',
                'description' => 'Links to the event order wizard',
                'is_public' => true,
            ],
            [
                'key' => 'contact_events_cta_headline',
                'value' => 'Planning an event?',
                'type' => 'text',
                'group' => 'Contact',
                'label' => 'Contact page events CTA headline',
                'description' => 'CTA block on contact page',
                'is_public' => true,
            ],
            [
                'key' => 'contact_events_cta_text',
                'value' => 'Build a draft order with catering trays and custom lines — we will send a quote.',
                'type' => 'textarea',
                'group' => 'Contact',
                'label' => 'Contact page events CTA text',
                'description' => 'Supporting copy for contact events CTA',
                'is_public' => true,
            ],
        ] as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                [...$row, 'created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'catering_notify_email',
            'events_section_headline',
            'events_section_blurb',
            'events_section_browse_cta',
            'events_section_plan_cta',
            'contact_events_cta_headline',
            'contact_events_cta_text',
        ])->delete();

        Schema::dropIfExists('catering_request_lines');

        Schema::table('otp_verifications', function (Blueprint $table) {
            if (Schema::hasColumn('otp_verifications', 'email')) {
                $table->dropColumn('email');
            }
            if (Schema::hasColumn('otp_verifications', 'channel')) {
                $table->dropColumn('channel');
            }
        });

        Schema::table('catering_requests', function (Blueprint $table) {
            try {
                $table->dropIndex('catering_requests_event_date_status_index');
            } catch (Throwable) {
            }

            foreach ([
                'fulfillment_options',
                'dietary_notes',
                'onsite_contact_phone',
                'onsite_contact_name',
                'delivery_island',
                'delivery_address',
                'venue_name',
                'setup_time',
                'fulfillment_time',
                'fulfillment_method',
                'event_type',
                'reference',
            ] as $col) {
                if (Schema::hasColumn('catering_requests', $col)) {
                    $table->dropColumn($col);
                }
            }
            if (Schema::hasColumn('catering_requests', 'customer_id')) {
                $table->dropConstrainedForeignId('customer_id');
            }
        });
    }
};
