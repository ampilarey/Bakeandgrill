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
        Schema::create('menu_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('kitchen_menu_state', function (Blueprint $table) {
            $table->id();
            /** @var array<int> JSON list of menu_group IDs whose items are on duty */
            $table->json('active_menu_group_ids');
            $table->timestamps();
        });

        Schema::create('item_channel_availability', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->string('channel', 32); // dine_in, takeaway, online_pickup, delivery
            $table->boolean('is_enabled')->default(true);
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
            $table->timestamps();

            $table->unique(['item_id', 'channel']);
            $table->index(['channel', 'is_enabled']);
        });

        Schema::table('items', function (Blueprint $table) {
            $table->foreignId('menu_group_id')->nullable()->after('category_id')->constrained('menu_groups')->nullOnDelete();
        });

        $now = now();

        DB::table('menu_groups')->insert([
            'id' => 1,
            'name' => 'Default',
            'slug' => 'default',
            'sort_order' => 0,
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('kitchen_menu_state')->insert([
            'id' => 1,
            'active_menu_group_ids' => json_encode([1]),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('items')->update(['menu_group_id' => 1]);

        $channels = ['dine_in', 'takeaway', 'online_pickup', 'delivery'];
        foreach (DB::table('items')->pluck('id') as $itemId) {
            foreach ($channels as $ch) {
                DB::table('item_channel_availability')->insert([
                    'item_id' => $itemId,
                    'channel' => $ch,
                    'is_enabled' => true,
                    'valid_from' => null,
                    'valid_until' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        DB::table('site_settings')->insertOrIgnore([
            [
                'key' => 'delivery_accepting_orders',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Ordering',
                'label' => 'Accept delivery orders',
                'description' => 'When off, customers cannot place delivery orders (takeaway/dine-in unaffected).',
                'is_public' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'key' => 'delivery_unavailable_message',
                'value' => 'Delivery is paused right now. Please choose takeaway or try again later.',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Message when delivery is off',
                'description' => 'Shown on the order app when delivery is disabled.',
                'is_public' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', ['delivery_accepting_orders', 'delivery_unavailable_message'])->delete();

        Schema::table('items', function (Blueprint $table) {
            $table->dropForeign(['menu_group_id']);
            $table->dropColumn('menu_group_id');
        });

        Schema::dropIfExists('item_channel_availability');
        Schema::dropIfExists('kitchen_menu_state');
        Schema::dropIfExists('menu_groups');
    }
};
