<?php

declare(strict_types=1);

use App\Domains\PrayerTimes\Actions\GetIslandCollection;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('prayer_islands')) {
            return;
        }

        $needsLatin = DB::table('prayer_islands')
            ->where(function ($q) {
                $q->whereNull('name_latin')->orWhereNull('atoll_latin');
            })
            ->exists();

        if (!$needsLatin) {
            return;
        }

        Artisan::call('prayer:add-latin-names');
        GetIslandCollection::forgetCache();
    }

    public function down(): void
    {
        // Data backfill — no rollback.
    }
};
