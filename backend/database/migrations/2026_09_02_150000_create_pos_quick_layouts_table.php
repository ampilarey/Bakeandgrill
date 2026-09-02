<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Quick tabs on the till, several per cashier.
 *
 * Owner, 2026-09-02, the same afternoon the single Quick tab went in: "can
 * he add more than one quick tab and able to rename the tabs and able to re
 * arrange the tabs?" — and switch by time of day, and copy another
 * cashier's layout.
 *
 * One row per owner (`user_id` null is the shared layout every till starts
 * with), holding the tabs as a document: name, items in order, optional
 * hours. Saved whole after every change, like the flat list it replaces.
 * Whatever was pinned in pos_quick_keys moves into a tab called "Quick".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pos_quick_layouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->cascadeOnDelete();
            /** @var array list of {id, name, items: int[], from: 'HH:MM'|null, to: 'HH:MM'|null} */
            $table->json('tabs');
            $table->timestamps();
        });

        if (Schema::hasTable('pos_quick_keys')) {
            $rows = DB::table('pos_quick_keys')->orderBy('sort_order')->orderBy('id')->get();
            $byOwner = [];
            foreach ($rows as $row) {
                $owner = $row->user_id === null ? 'shared' : (string) $row->user_id;
                $byOwner[$owner][] = (int) $row->item_id;
            }
            foreach ($byOwner as $owner => $items) {
                DB::table('pos_quick_layouts')->insert([
                    'user_id' => $owner === 'shared' ? null : (int) $owner,
                    'tabs' => json_encode([[
                        'id' => 'tab-1',
                        'name' => 'Quick',
                        'items' => array_values(array_unique($items)),
                        'from' => null,
                        'to' => null,
                    ]]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            Schema::drop('pos_quick_keys');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('pos_quick_layouts');
    }
};
