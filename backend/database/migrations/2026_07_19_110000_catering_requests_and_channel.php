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
        if (Schema::hasTable('corporate_inquiries') && !Schema::hasTable('catering_requests')) {
            Schema::rename('corporate_inquiries', 'catering_requests');
        }

        if (!Schema::hasTable('catering_requests')) {
            Schema::create('catering_requests', function (Blueprint $table) {
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

        Schema::table('catering_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('catering_requests', 'occasion')) {
                $table->string('occasion', 40)->default('other')->after('company');
            }
            if (!Schema::hasColumn('catering_requests', 'interested_items')) {
                $table->json('interested_items')->nullable()->after('notes');
            }
            if (!Schema::hasColumn('catering_requests', 'staff_notes')) {
                $table->text('staff_notes')->nullable()->after('interested_items');
            }
            if (!Schema::hasColumn('catering_requests', 'quoted_amount')) {
                $table->decimal('quoted_amount', 10, 2)->nullable()->after('staff_notes');
            }
            if (!Schema::hasColumn('catering_requests', 'pos_order_id')) {
                $table->foreignId('pos_order_id')->nullable()->after('quoted_amount')
                    ->constrained('orders')->nullOnDelete();
            }
            if (!Schema::hasColumn('catering_requests', 'handled_by')) {
                $table->foreignId('handled_by')->nullable()->after('pos_order_id')
                    ->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('catering_requests', 'contacted_at')) {
                $table->timestamp('contacted_at')->nullable()->after('handled_by');
            }
            if (!Schema::hasColumn('catering_requests', 'quoted_at')) {
                $table->timestamp('quoted_at')->nullable()->after('contacted_at');
            }
            if (!Schema::hasColumn('catering_requests', 'confirmed_at')) {
                $table->timestamp('confirmed_at')->nullable()->after('quoted_at');
            }
            if (!Schema::hasColumn('catering_requests', 'source')) {
                $table->string('source', 40)->nullable()->after('confirmed_at');
            }
        });

        // Map legacy corporate statuses: closed → cancelled
        DB::table('catering_requests')->where('status', 'closed')->update(['status' => 'cancelled']);

        // Optional one-time import from historical pre_orders (ids only when possible)
        if (Schema::hasTable('pre_orders')
            && !DB::table('catering_requests')->where('source', 'pre_order_import')->exists()) {
            DB::table('pre_orders')->orderBy('id')->chunkById(100, function ($rows) {
                foreach ($rows as $row) {
                    $status = match ((string) $row->status) {
                        'confirmed', 'preparing', 'ready' => 'confirmed',
                        'completed' => 'completed',
                        'cancelled' => 'cancelled',
                        'approved' => 'contacted',
                        default => 'new',
                    };

                    $itemIds = [];
                    $rawItems = json_decode((string) ($row->items ?? '[]'), true);
                    if (is_array($rawItems)) {
                        foreach ($rawItems as $line) {
                            if (is_array($line) && isset($line['item_id'])) {
                                $itemIds[] = (int) $line['item_id'];
                            }
                        }
                    }

                    DB::table('catering_requests')->insert([
                        'company' => null,
                        'occasion' => 'event',
                        'contact_name' => (string) ($row->customer_name ?: 'Guest'),
                        'phone' => (string) ($row->customer_phone ?: '0000000'),
                        'email' => $row->customer_email,
                        'event_date' => $row->fulfillment_date
                            ? date('Y-m-d', strtotime((string) $row->fulfillment_date))
                            : null,
                        'headcount' => null,
                        'notes' => $row->customer_notes,
                        'interested_items' => $itemIds !== [] ? json_encode(array_values(array_unique($itemIds))) : null,
                        'quoted_amount' => $row->total,
                        'status' => $status,
                        'source' => 'pre_order_import',
                        'created_at' => $row->created_at ?? now(),
                        'updated_at' => $row->updated_at ?? now(),
                    ]);
                }
            });
        }

        // Opt-in catering channel for all items (disabled by default)
        if (Schema::hasTable('item_channel_availability') && Schema::hasTable('items')) {
            $now = now();
            $itemIds = DB::table('items')->pluck('id');
            foreach ($itemIds as $itemId) {
                DB::table('item_channel_availability')->updateOrInsert(
                    ['item_id' => $itemId, 'channel' => 'catering'],
                    [
                        'is_enabled' => false,
                        'valid_from' => null,
                        'valid_until' => null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ],
                );
            }
        }

        $now = now();
        foreach ([
            [
                'key' => 'catering_notify_phone',
                'value' => '',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Catering staff notify phone',
                'description' => 'SMS alert number when a catering request is submitted (7-digit local or +960…)',
                'is_public' => false,
            ],
            [
                'key' => 'catering_min_lead_hours',
                'value' => '24',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Catering minimum lead time (hours)',
                'description' => 'Event date must be at least this many hours ahead',
                'is_public' => false,
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
            'catering_notify_phone',
            'catering_min_lead_hours',
        ])->delete();

        DB::table('item_channel_availability')->where('channel', 'catering')->delete();
        DB::table('catering_requests')->where('source', 'pre_order_import')->delete();

        Schema::table('catering_requests', function (Blueprint $table) {
            foreach (['confirmed_at', 'quoted_at', 'contacted_at', 'source'] as $col) {
                if (Schema::hasColumn('catering_requests', $col)) {
                    $table->dropColumn($col);
                }
            }
            if (Schema::hasColumn('catering_requests', 'handled_by')) {
                $table->dropConstrainedForeignId('handled_by');
            }
            if (Schema::hasColumn('catering_requests', 'pos_order_id')) {
                $table->dropConstrainedForeignId('pos_order_id');
            }
            foreach (['quoted_amount', 'staff_notes', 'interested_items', 'occasion'] as $col) {
                if (Schema::hasColumn('catering_requests', $col)) {
                    $table->dropColumn($col);
                }
            }
        });

        if (Schema::hasTable('catering_requests') && !Schema::hasTable('corporate_inquiries')) {
            Schema::rename('catering_requests', 'corporate_inquiries');
        }
    }
};
