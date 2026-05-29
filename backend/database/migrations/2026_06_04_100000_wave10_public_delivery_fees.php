<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_settings')
            ->whereIn('key', ['delivery_default_fee', 'delivery_zone_fees'])
            ->update(['is_public' => true, 'updated_at' => now()]);
    }

    public function down(): void
    {
        DB::table('site_settings')
            ->whereIn('key', ['delivery_default_fee', 'delivery_zone_fees'])
            ->update(['is_public' => false, 'updated_at' => now()]);
    }
};
