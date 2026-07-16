<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Small-café default: cashiers can Mark Ready from POS without a
 * kitchen-receive handshake. Larger kitchens can turn the setting
 * back on in Admin → Kitchen Production.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_settings')->updateOrInsert(
            ['key' => 'kitchen_require_pos_receiving_before_ready'],
            [
                'value' => 'false',
                'type' => 'boolean',
                'group' => 'Kitchen',
                'label' => 'Remind POS to receive before Mark Ready',
                'description' => 'When on, Active Orders shows a receive tip. Cashiers can always Mark Ready.',
                'is_public' => false,
            ],
        );
    }

    public function down(): void
    {
        DB::table('site_settings')
            ->where('key', 'kitchen_require_pos_receiving_before_ready')
            ->update(['value' => 'true']);
    }
};
