<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * GST on delivery and small-order fees.
 *
 * Until now only the packaging fee could be taxed — delivery, the small-order
 * fee and the tip were all added to the order total after tax was worked out,
 * so GST was never charged on them. A tip is not a supply and stays untaxed.
 * A delivery charge is a taxable supply in the Maldives (owner decision,
 * 2026-08-23), and so is the small-order surcharge, which is simply extra
 * consideration for the same food.
 *
 * Both default to ON, which matches the position the owner confirmed. They are
 * separate switches because the answer is a tax question that can change, and
 * because an owner who takes different advice must be able to act on it without
 * a deploy.
 *
 * Historic orders are left exactly as they were charged. This changes what is
 * collected from here on; it does not restate what was already invoiced.
 */
return new class extends Migration
{
    /** @var array<string, array{label: string, description: string}> */
    private const SETTINGS = [
        'delivery_fee_taxable' => [
            'label' => 'Delivery fee taxable',
            'description' => 'When on, GST applies to the delivery fee (exclusive: add tax; inclusive: fee embeds tax).',
        ],
        'small_order_fee_taxable' => [
            'label' => 'Small-order fee taxable',
            'description' => 'When on, GST applies to the small-order fee (exclusive: add tax; inclusive: fee embeds tax).',
        ],
    ];

    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        foreach (self::SETTINGS as $key => $meta) {
            // Never overwrite a value the owner already set — a re-run of this
            // migration must not silently switch GST back on.
            if (SiteSetting::get($key) === null) {
                SiteSetting::set($key, '1');
            }

            SiteSetting::query()
                ->where('key', $key)
                ->update([
                    'type' => 'boolean',
                    'group' => 'ordering',
                    'label' => $meta['label'],
                    'description' => $meta['description'],
                    'is_public' => true,
                ]);
        }

        SiteSetting::bust();
    }

    public function down(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        SiteSetting::query()->whereIn('key', array_keys(self::SETTINGS))->delete();
        SiteSetting::bust();
    }
};
