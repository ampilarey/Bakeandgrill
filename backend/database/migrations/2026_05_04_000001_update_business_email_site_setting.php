<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_settings')
            ->where('key', 'business_email')
            ->where('value', 'hello@bakeandgrill.mv')
            ->update(['value' => 'admin@bakeandgrill.mv']);

        // Bust the site settings cache
        \Illuminate\Support\Facades\Cache::forget('site_settings_all');
    }

    public function down(): void
    {
        DB::table('site_settings')
            ->where('key', 'business_email')
            ->where('value', 'admin@bakeandgrill.mv')
            ->update(['value' => 'hello@bakeandgrill.mv']);

        \Illuminate\Support\Facades\Cache::forget('site_settings_all');
    }
};
