<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Check which columns exist in site_settings to avoid errors on different schema versions
        $columns = DB::getSchemaBuilder()->getColumnListing('site_settings');

        $data = ['key' => 'maps_embed_url'];
        if (in_array('value',       $columns)) $data['value']       = null;
        if (in_array('type',        $columns)) $data['type']        = 'text';
        if (in_array('group',       $columns)) $data['group']       = 'Contact';
        if (in_array('label',       $columns)) $data['label']       = 'Google Maps Embed URL';
        if (in_array('description', $columns)) $data['description'] = 'Paste the full iframe src URL from Google Maps "Share → Embed a map"';
        if (in_array('is_public',   $columns)) $data['is_public']   = true;
        if (in_array('sort_order',  $columns)) $data['sort_order']  = 50;
        if (in_array('created_at',  $columns)) $data['created_at']  = now();
        if (in_array('updated_at',  $columns)) $data['updated_at']  = now();

        DB::table('site_settings')->updateOrInsert(['key' => 'maps_embed_url'], $data);
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'maps_embed_url')->delete();
    }
};
