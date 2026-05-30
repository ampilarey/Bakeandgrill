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
        Schema::table('orders', function (Blueprint $table): void {
            if (!Schema::hasColumn('orders', 'pickup_slot_at')) {
                $table->timestamp('pickup_slot_at')->nullable()->after('estimated_wait_minutes');
            }
            if (!Schema::hasColumn('orders', 'proof_of_delivery_path')) {
                $table->string('proof_of_delivery_path', 500)->nullable()->after('delivered_at');
            }
        });

        $rows = [
            [
                'key' => 'pickup_slots_enabled',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Ordering',
                'label' => 'Enable pickup time slots',
                'description' => 'Customers choose a pickup window at checkout',
                'is_public' => true,
            ],
            [
                'key' => 'pickup_slot_minutes',
                'value' => '30',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Pickup slot length (minutes)',
                'description' => 'Length of each pickup window',
                'is_public' => true,
            ],
            [
                'key' => 'pickup_slot_capacity',
                'value' => '8',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Max orders per pickup slot',
                'description' => 'Capacity per slot before it shows as full',
                'is_public' => true,
            ],
        ];

        foreach ($rows as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()]),
            );
        }
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            if (Schema::hasColumn('orders', 'pickup_slot_at')) {
                $table->dropColumn('pickup_slot_at');
            }
            if (Schema::hasColumn('orders', 'proof_of_delivery_path')) {
                $table->dropColumn('proof_of_delivery_path');
            }
        });

        DB::table('site_settings')->whereIn('key', [
            'pickup_slots_enabled',
            'pickup_slot_minutes',
            'pickup_slot_capacity',
        ])->delete();
    }
};
