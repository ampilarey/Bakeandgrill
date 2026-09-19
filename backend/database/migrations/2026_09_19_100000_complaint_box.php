<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The complaint box.
 *
 * Owner, 2026-09-19: "some customers complain about staffs ... an easy way
 * for customers to complain ... anonymously or after submitting his mobile
 * number ... i want a separate complaints option not the one now used,
 * because now complain is about the receipt."
 *
 * The existing `complaints` table hangs off a receipt or invoice: it is about
 * an order, it needs the order's token, and its categories are order problems
 * (wrong item, missing item, wrong amount). This is a different thing — a
 * complaint about the place, from anybody, with or without an order and with
 * or without a name — so it gets its own table rather than a nullable
 * receipt_id and a growing pile of "if no receipt" branches in the old code.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('complaint_box_entries', function (Blueprint $table) {
            $table->id();
            $table->string('reference_number', 32)->unique();
            $table->json('categories');
            // "Who served you" — free text, because the customer does not know staff ids.
            $table->string('about_staff', 120)->nullable();
            $table->text('comment')->nullable();
            // Normalised +960… or null for an anonymous complaint.
            $table->string('phone', 20)->nullable();
            $table->boolean('is_anonymous')->default(true);
            $table->string('order_ref', 40)->nullable();
            $table->date('visited_on')->nullable();
            $table->string('source', 24)->default('web'); // web|receipt|poster
            $table->string('status', 24)->default('new'); // new|in_progress|resolved|closed
            $table->string('owner_alert_status', 24)->default('pending');
            $table->text('owner_alert_detail')->nullable();
            $table->text('internal_note')->nullable();
            $table->text('last_message')->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamp('taken_up_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('ip_hash', 64)->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index('phone');
        });

        // Everything that happened to an entry after it arrived: status
        // changes, notes, and every SMS sent to the customer with its result.
        Schema::create('complaint_box_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entry_id')->constrained('complaint_box_entries')->cascadeOnDelete();
            $table->string('type', 24); // status|note|sms
            $table->string('from_status', 24)->nullable();
            $table->string('to_status', 24)->nullable();
            $table->text('message')->nullable();
            $table->string('sms_status', 24)->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('entry_id');
        });

        $now = now();
        $templates = [
            [
                'slug' => 'owner_complaint_box_received',
                'name' => 'Complaint box: new complaint (owner)',
                'type' => 'order_notification',
                'body' => 'New complaint {{reference}}: {{category}}{{staff}}. {{contact}} Open Complaint Box in admin.',
                'description' => 'Sent to owner phones when a complaint arrives through the public complaint form.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Complaint reference'],
                    ['name' => 'category', 'description' => 'What it is about'],
                    ['name' => 'staff', 'description' => '" about <name>" when the customer named someone, else empty'],
                    ['name' => 'contact', 'description' => '"Customer left a number." or "Anonymous."'],
                ]),
            ],
            [
                'slug' => 'customer_complaint_box_acknowledged',
                'name' => 'Complaint box: received (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: thank you, we have received your complaint ({{reference}}). We will look into it and message you here.',
                'description' => 'Acknowledgement to a customer who left a phone number on the complaint form.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Complaint reference'],
                ]),
            ],
            [
                'slug' => 'customer_complaint_box_update',
                'name' => 'Complaint box: update (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill ({{reference}}): {{message}}',
                'description' => 'What the owner writes to the customer when a complaint is taken up or closed.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Complaint reference'],
                    ['name' => 'message', 'description' => 'The message typed in admin'],
                ]),
            ],
        ];
        foreach ($templates as $row) {
            DB::table('sms_templates')->updateOrInsert(
                ['slug' => $row['slug']],
                array_merge($row, ['created_at' => $now, 'updated_at' => $now]),
            );
        }

        foreach ([
            ['key' => 'sms_owner_complaint_box_received_enabled', 'label' => 'SMS: complaint box — new complaint (owner)'],
            ['key' => 'sms_customer_complaint_box_acknowledged_enabled', 'label' => 'SMS: complaint box — received (customer)'],
            ['key' => 'sms_customer_complaint_box_update_enabled', 'label' => 'SMS: complaint box — update (customer)'],
        ] as $s) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $s['key']],
                [
                    'value' => '1',
                    'type' => 'boolean',
                    'group' => 'SMS',
                    'label' => $s['label'],
                    'description' => $s['label'],
                    'is_public' => false,
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('complaint_box_events');
        Schema::dropIfExists('complaint_box_entries');
        DB::table('sms_templates')->whereIn('slug', [
            'owner_complaint_box_received',
            'customer_complaint_box_acknowledged',
            'customer_complaint_box_update',
        ])->delete();
        DB::table('site_settings')->whereIn('key', [
            'sms_owner_complaint_box_received_enabled',
            'sms_customer_complaint_box_acknowledged_enabled',
            'sms_customer_complaint_box_update_enabled',
        ])->delete();
    }
};
