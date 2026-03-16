<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_settings')->updateOrInsert(
            ['key' => 'maps_embed_url'],
            [
                'key'         => 'maps_embed_url',
                'value'       => null,
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Google Maps Embed URL',
                'description' => 'Paste the full iframe src URL from Google Maps "Share → Embed a map"',
                'is_public'   => true,
                'sort_order'  => 50,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]
        );
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'maps_embed_url')->delete();
    }
};
