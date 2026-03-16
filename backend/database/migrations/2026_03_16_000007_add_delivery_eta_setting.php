<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $columns = DB::getSchemaBuilder()->getColumnListing('site_settings');

        $data = ['key' => 'delivery_eta'];
        if (in_array('value',       $columns)) $data['value']       = '30–45 min';
        if (in_array('type',        $columns)) $data['type']        = 'text';
        if (in_array('group',       $columns)) $data['group']       = 'Ordering';
        if (in_array('label',       $columns)) $data['label']       = 'Estimated Delivery Time';
        if (in_array('description', $columns)) $data['description'] = 'Shown to customers at checkout, e.g. "30–45 min"';
        if (in_array('is_public',   $columns)) $data['is_public']   = true;
        if (in_array('created_at',  $columns)) $data['created_at']  = now();
        if (in_array('updated_at',  $columns)) $data['updated_at']  = now();

        DB::table('site_settings')->updateOrInsert(['key' => 'delivery_eta'], $data);
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'delivery_eta')->delete();
    }
};
