<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * CMS-editable order-app home greeting copy (Content Hub → Order App).
 */
return new class extends Migration
{
    /** @var list<array{key: string, value: string, label: string, description: string}> */
    private const ROWS = [
        [
            'key' => 'order_home_greeting_hello',
            'value' => 'Hello',
            'label' => 'Home greeting — Hello',
            'description' => 'Welcome line when the customer has no profile name (or is signed out).',
        ],
        [
            'key' => 'order_home_greeting_named',
            'value' => 'Hello, {name}',
            'label' => 'Home greeting — with name',
            'description' => 'Welcome line when a profile name is set. Use {name} for the customer’s name.',
        ],
        [
            'key' => 'order_home_greeting_sub',
            'value' => 'What would you like today?',
            'label' => 'Home greeting — subtitle',
            'description' => 'Short line under the Hello greeting on the order-app home.',
        ],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        $now = now();
        $hasScope = Schema::hasColumn('site_settings', 'scope');
        $hasLocale = Schema::hasColumn('site_settings', 'locale');

        foreach (self::ROWS as $row) {
            $attrs = [
                'key' => $row['key'],
                'value' => $row['value'],
                'type' => 'text',
                'group' => 'Order App',
                'label' => $row['label'],
                'description' => $row['description'],
                'is_public' => true,
                'updated_at' => $now,
            ];
            if ($hasScope) {
                $attrs['scope'] = 'order_app';
            }
            if ($hasLocale) {
                $attrs['locale'] = 'en';
            }

            $query = DB::table('site_settings')->where('key', $row['key']);
            if ($hasScope) {
                $query->where('scope', 'order_app');
            }
            if ($hasLocale) {
                $query->where('locale', 'en');
            }

            if ($query->exists()) {
                $query->update([
                    'type' => 'text',
                    'group' => 'Order App',
                    'label' => $row['label'],
                    'description' => $row['description'],
                    'is_public' => true,
                    'updated_at' => $now,
                ]);
            } else {
                $attrs['created_at'] = $now;
                DB::table('site_settings')->insert($attrs);
            }
        }

        SiteSetting::bust();
    }

    public function down(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        $query = DB::table('site_settings')->whereIn('key', array_column(self::ROWS, 'key'));
        if (Schema::hasColumn('site_settings', 'scope')) {
            $query->where('scope', 'order_app');
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $query->where('locale', 'en');
        }
        $query->delete();

        SiteSetting::bust();
    }
};
