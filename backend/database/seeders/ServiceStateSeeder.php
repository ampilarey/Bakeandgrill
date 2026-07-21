<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeds one service_states row per service_key in
 * config('service_availability.keys').
 *
 * All rows default to status=available so the seeder is safe to run on live
 * traffic — enforcement is opt-in (admins must flip a row to disable a
 * service). Idempotent via updateOrInsert on service_key.
 */
class ServiceStateSeeder extends Seeder
{
    public function run(): void
    {
        $keys = config('service_availability.keys', []);
        $now = now();

        foreach ($keys as $serviceKey => $meta) {
            DB::table('service_states')->updateOrInsert(
                ['service_key' => $serviceKey],
                [
                    'group' => $meta['group'] ?? 'public',
                    'status' => 'available',
                    'reason_type' => null,
                    'public_message' => null,
                    'internal_note' => null,
                    'alternatives' => null,
                    'allow_existing_operations' => true,
                    'allow_admin_bypass' => true,
                    'starts_at' => null,
                    'ends_at' => null,
                    'current_incident_id' => null,
                    'notify_enabled' => true,
                    'updated_at' => $now,
                    'created_at' => $now,
                ],
            );
        }
    }
}
