<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PrayerTimesSeeder extends Seeder
{
    public function run(): void
    {
        $sqlitePath = env('PRAYER_TIMES_DB', database_path('salat.db'));

        if (!file_exists($sqlitePath)) {
            $this->command->error("SQLite source DB not found at: {$sqlitePath}");
            $this->command->line('Set PRAYER_TIMES_DB in your .env to the path of salat.db');
            return;
        }

        $sqlite = new \PDO("sqlite:{$sqlitePath}");
        $sqlite->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);

        $driver = DB::getDriverName();

        DB::transaction(function () use ($sqlite, $driver) {
            if ($driver === 'mysql') {
                DB::statement('SET FOREIGN_KEY_CHECKS=0;');
            }

            // ── Categories ──────────────────────────────────────────────
            $this->command->info('Seeding prayer_categories...');
            DB::table('prayer_categories')->truncate();
            $cats = $sqlite->query('SELECT Id FROM Category')->fetchAll(\PDO::FETCH_COLUMN);
            foreach ($cats as $catId) {
                DB::table('prayer_categories')->insert(['id' => $catId]);
            }
            $this->command->info('Inserted ' . count($cats) . ' categories.');

            // ── Islands ──────────────────────────────────────────────────
            $this->command->info('Seeding prayer_islands...');
            DB::table('prayer_islands')->truncate();
            $islands = $sqlite->query(
                'SELECT CategoryId, IslandId, Atoll, Island, Minutes, Latitude, Longitude, Status FROM Island'
            )->fetchAll(\PDO::FETCH_ASSOC);

            $islandRows = array_map(fn ($r) => [
                'id'             => (int)  $r['IslandId'],
                'category_id'    => (int)  $r['CategoryId'],
                'atoll'          => $r['Atoll'],
                'name'           => $r['Island'],
                'offset_minutes' => (int)  $r['Minutes'],
                'latitude'       => ($r['Latitude']  !== '' && $r['Latitude']  !== null) ? (float) $r['Latitude']  : null,
                'longitude'      => ($r['Longitude'] !== '' && $r['Longitude'] !== null) ? (float) $r['Longitude'] : null,
                'is_active'      => (bool) $r['Status'],
            ], $islands);

            foreach (array_chunk($islandRows, 100) as $chunk) {
                DB::table('prayer_islands')->insert($chunk);
            }
            $this->command->info('Inserted ' . count($islandRows) . ' islands.');

            // ── Prayer times ──────────────────────────────────────────────
            $this->command->info('Seeding prayer_times (15 372 rows)...');
            DB::table('prayer_times')->truncate();
            $stmt = $sqlite->query(
                'SELECT CategoryId, Date, Fajuru, Sunrise, Dhuhr, Asr, Maghrib, Isha FROM PrayerTimes'
            );

            $buffer = [];
            $total  = 0;
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $buffer[] = [
                    'category_id' => (int) $row['CategoryId'],
                    'day_of_year' => (int) $row['Date'],
                    'fajr'        => (int) $row['Fajuru'],
                    'sunrise'     => (int) $row['Sunrise'],
                    'dhuhr'       => (int) $row['Dhuhr'],
                    'asr'         => (int) $row['Asr'],
                    'maghrib'     => (int) $row['Maghrib'],
                    'isha'        => (int) $row['Isha'],
                ];
                if (count($buffer) >= 500) {
                    DB::table('prayer_times')->insert($buffer);
                    $total += count($buffer);
                    $buffer = [];
                }
            }
            if ($buffer) {
                DB::table('prayer_times')->insert($buffer);
                $total += count($buffer);
            }
            $this->command->info("Inserted {$total} prayer time rows.");

            if ($driver === 'mysql') {
                DB::statement('SET FOREIGN_KEY_CHECKS=1;');
            }
        });
    }
}
