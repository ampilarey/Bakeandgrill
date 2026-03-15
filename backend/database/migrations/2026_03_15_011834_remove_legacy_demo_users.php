<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Remove the old admin and cashier demo accounts that existed before
        // the role consolidation (admin → owner, cashier → staff).
        DB::table('users')->whereIn('email', [
            'admin@bakegrill.local',
            'cashier@bakegrill.local',
        ])->delete();
    }

    public function down(): void
    {
        // No rollback — these accounts should not be recreated automatically.
    }
};
