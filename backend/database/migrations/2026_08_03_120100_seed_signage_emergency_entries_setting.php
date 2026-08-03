<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $payload = json_encode(['entries' => []], JSON_UNESCAPED_UNICODE);
        $attrs = ['key' => 'signage_emergency_entries'];
        if (Schema::hasColumn('site_settings', 'scope')) {
            $attrs['scope'] = 'shared';
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $attrs['locale'] = 'en';
        }

        $exists = DB::table('site_settings')->where($attrs)->exists();
        if ($exists) {
            return;
        }

        DB::table('site_settings')->insert(array_merge($attrs, [
            'value' => $payload,
            'type' => 'json',
            'group' => 'Signage',
            'label' => 'Signage emergency entries',
            'description' => 'Scheduled emergency slides (manual override remains signage_emergency)',
            'is_public' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]));
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'signage_emergency_entries')->delete();
    }
};
