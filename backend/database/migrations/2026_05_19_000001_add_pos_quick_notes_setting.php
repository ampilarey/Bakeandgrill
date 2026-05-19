<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Seeds a single site_settings row — `pos_quick_notes` — used by the
 * POS to render a tap-to-pick chip list of common kitchen notes
 * (e.g. "No salt", "Extra spicy"). Owners can edit / add / remove
 * chips from Admin → Settings → Website Settings; cashiers attach
 * the chips per cart line, and the joined string lands on
 * `order_items.notes` so it prints on both the kitchen ticket and
 * the customer receipt.
 *
 * Why a site setting and not a new dedicated table:
 *  - It's literally a flat list of short strings; a whole CRUD table
 *    and admin page would be overkill.
 *  - The site_settings pipeline already has caching + admin editing
 *    out of the box (see `cms-architecture.mdc`).
 *  - `is_public = true` because the POS app fetches this from the
 *    public site-settings endpoint (no auth needed for the chip list
 *    itself — it's not sensitive).
 *
 * The seeded defaults cover the common Maldivian bake-and-grill
 * service cases. Owners are expected to tune the list to their menu.
 */
return new class extends Migration
{
    public function up(): void
    {
        $default = [
            'No salt',
            'No onion',
            'No spice',
            'Extra spicy',
            'Well done',
            'Cut in half',
            'No ice',
            'Less sugar',
            'For kid',
            'Allergy — please check',
        ];

        DB::table('site_settings')->updateOrInsert(
            ['key' => 'pos_quick_notes'],
            [
                'value' => json_encode($default, JSON_UNESCAPED_UNICODE),
                'type' => 'json',
                'group' => 'POS',
                'label' => 'POS — Quick Notes',
                'description' => 'Tap-to-add kitchen notes shown to cashiers per cart line '
                    . '(e.g. "No salt", "Extra spicy"). Edit the JSON array to add / remove chips. '
                    . 'The chosen notes print on the kitchen ticket and the customer receipt.',
                'is_public' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'pos_quick_notes')->delete();
    }
};
